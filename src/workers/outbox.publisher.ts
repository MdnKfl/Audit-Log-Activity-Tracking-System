import 'dotenv/config';
// Background process that bridges committed main-database outbox rows to the Redis audit queue.
import { auditEventSchema } from '../types/audit.types';
import { prisma } from '../infrastructure/database/main.client';
import { connection } from '../infrastructure/redis/redis.client';
import { auditQueue } from '../infrastructure/redis/audit.queue';

// Bound database and memory work per poll while keeping newly committed events moving promptly.
const batchSize = 50;
// Poll once per second so newly committed audit events do not wait long before publishing.
const pollIntervalMs = 1_000;
// Set by process signal handlers so the loop can finish its current batch before closing dependencies.
let stopping = false;

/** Reads committed PENDING rows, publishes each event, then marks successful Redis handoffs. */
async function publishPendingEvents() {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  for (const row of pending) {
    const parsed = auditEventSchema.safeParse({
      eventId: row.eventId,
      eventType: row.eventType,
      actor: { type: row.actorType, ...(row.actorId && { id: row.actorId }) },
      resource: { type: row.resourceType, ...(row.resourceId && { id: row.resourceId }) },
      outcome: row.outcome,
      metadata: row.metadata,
      occurredAt: row.occurredAt.toISOString(),
    });
    if (!parsed.success) {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'FAILED', lastError: 'Stored outbox payload is invalid' },
      });
      console.error('Invalid outbox event moved to FAILED:', row.eventId);
      continue;
    }

    try {
      // The stable job ID makes a retry after Redis acknowledgement safe while the job is retained.
      await auditQueue.add('audit.log', parsed.data, { jobId: row.eventId });
      // Mark only after Redis accepts the job; a crash between writes causes a safe retry.
      await prisma.outboxEvent.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
      });
    } catch (error) {
      // Leave the row pending so the next poll retries it; Redis may already have accepted it.
      console.error(`Could not publish outbox event ${row.eventId}:`, error);
    }
  }
}

/** Repeats polling until shutdown; transient database/Redis errors are logged and retried next cycle. */
async function run() {
  console.log('Outbox publisher started');
  while (!stopping) {
    try {
      await publishPendingEvents();
    } catch (error) {
      console.error('Outbox poll failed:', error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// Keep the publisher active for the lifetime of this process and reuse its promise during shutdown.
const runPromise = run();

/** Waits for the poll loop to stop before closing queue, Redis, and main database resources. */
async function shutdown() {
  stopping = true;
  await runPromise;
  await auditQueue.close();
  await connection.quit();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch((error) => {
      console.error('Outbox publisher shutdown failed:', error);
      process.exitCode = 1;
    });
  });
}

void runPromise.catch((error) => {
  console.error('Outbox publisher stopped unexpectedly:', error);
  process.exitCode = 1;
});

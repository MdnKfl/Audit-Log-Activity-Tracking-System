import 'dotenv/config';
// Background process that bridges committed main-database outbox rows to the Redis audit queue.
import { auditEventSchema } from '../types/audit.types';
import { prisma } from '../infrastructure/database/main.client';
import { connection } from '../infrastructure/redis/redis.client';
import { auditQueue } from '../infrastructure/redis/audit.queue';

const batchSize = 50;
const pollIntervalMs = 1_000;
let stopping = false;

async function publishPendingEvents() {
  // Limit each poll so a backlog does not require loading the entire outbox into memory.
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

const runPromise = run();

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

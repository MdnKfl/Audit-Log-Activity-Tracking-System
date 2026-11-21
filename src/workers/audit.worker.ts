import 'dotenv/config';
// Background consumer: validates queued audit events and persists them in permanent audit storage.
import { Prisma } from '../../generated/audit-client/client';
import { Worker, UnrecoverableError } from 'bullmq';
import { auditEventSchema } from '../types/audit.types';
import { auditPrisma } from '../infrastructure/database/audit.client';
import { connection } from '../infrastructure/redis/redis.client';
import { AUDIT_QUEUE } from '../infrastructure/redis/audit.queue';
import { auditRepository } from '../repositories/audit.repository';

// BullMQ owns delivery/retry mechanics; this callback owns validation and durable audit persistence.
const worker = new Worker(
  AUDIT_QUEUE,
  async (job) => {
    // Redis is a process boundary; validate before treating queued data as an audit event.
    const parsed = auditEventSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Invalid audit payload');

    try {
      // A job is acknowledged only after its audit row is committed in the separate audit database.
      await auditRepository.insert(parsed.data);
      console.log('Saved audit event:', parsed.data.eventId);
    } catch (error) {
      // At-least-once delivery can repeat an event; the unique eventId makes inserts idempotent.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        console.log('Duplicate audit event already persisted:', parsed.data.eventId);
        return;
      }
      throw error;
    }
  },
  { connection, concurrency: 5 },
);

// Keep the event ID and retry count in logs to make failed jobs traceable during operations.
worker.on('failed', (job, error) => {
  console.error(`Audit job ${job?.id} failed (attempt ${job?.attemptsMade}):`, error.message);
});

let shuttingDown = false;
/** Stops intake before closing the worker's database and Redis connections. */
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.close();
  await auditPrisma.$disconnect();
  await connection.quit();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch((error) => {
      console.error('Audit worker shutdown failed:', error);
      process.exitCode = 1;
    });
  });
}

console.log('Audit worker started, waiting for jobs...');

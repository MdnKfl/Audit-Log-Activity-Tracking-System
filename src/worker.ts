import 'dotenv/config';
import { Worker, UnrecoverableError } from 'bullmq';
import { Prisma } from '../generated/prisma/client';
import { prisma } from './config/prisma.config';
import { connection } from './config/redis.config';
import { AUDIT_QUEUE } from './queues/audit-log.queue';
import { auditEventSchema } from './modules/audit-log/audit-log.vaalidator';


const worker = new Worker(
  AUDIT_QUEUE,
  async (job) => {
    // 1. Validate: don't trust what comes out of the queue
    const parsed = auditEventSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError('Invalid audit payload'); // retrying can't fix this
    }
    const e = parsed.data;

    // 2. Save to Postgres
    try {
      await prisma.auditLog.create({
        data: {
          eventId: e.eventId,
          userId: e.userId,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          description: e.description,
          metadata: e.metadata as Prisma.InputJsonValue | undefined,
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
          createdAt: new Date(e.occurredAt),
        },
      });
      console.log('Saved audit log:', e.eventId);
    } catch (err) {
      // 3. Duplicate eventId means it was already saved)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        console.log('Duplicate, already processed:', e.eventId);
        return;
      }
      throw err; // anything else (DB down, etc.) makes BullMQ ret  ry
    }
  },
  { connection, concurrency: 5 },
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

// Graceful shutdown: finish the current job, then exit
async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);  
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Worker started, waiting for jobs...');
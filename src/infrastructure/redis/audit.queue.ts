import { Queue } from 'bullmq';
// Shared queue definition so the publisher and worker agree on the queue name and retry policy.
import { connection } from './redis.client';

export const AUDIT_QUEUE = 'nestsms-audit-logs';

// Retained job IDs make publisher retries safe; backoff retries transient worker failures.
export const auditQueue = new Queue(AUDIT_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
});

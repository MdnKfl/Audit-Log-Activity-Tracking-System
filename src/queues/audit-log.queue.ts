import { Queue } from 'bullmq';
import { connection } from '../config/redis.config';

export const AUDIT_QUEUE = 'nestsms-audit-logs';

export const auditQueue = new Queue(AUDIT_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
});
import 'dotenv/config';
// One Redis connection shared by BullMQ producers, consumers, and queue inspection endpoints.
import IORedis from 'ioredis';

// Fail during startup instead of running API/worker processes with an unusable queue connection.
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL must be set');

/** Shared BullMQ Redis connection imported by the API, publisher, and worker. */
export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
});

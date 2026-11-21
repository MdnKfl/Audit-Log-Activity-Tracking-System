import 'dotenv/config';
// One Redis connection shared by BullMQ producers, consumers, and queue inspection endpoints.
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL must be set');

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
});

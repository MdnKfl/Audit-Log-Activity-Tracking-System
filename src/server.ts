import 'dotenv/config';
// Process entry point for the API; app.ts defines routes while this file owns listening and shutdown.
import { app } from './app';
import { prisma } from './infrastructure/database/main.client';
import { auditPrisma } from './infrastructure/database/audit.client';
import { connection } from './infrastructure/redis/redis.client';
import { auditQueue } from './infrastructure/redis/audit.queue';

// Keep the listen port configurable for local runs and container deployments.
const port = Number(process.env.PORT) || 3000;
// Starting the listener belongs here so importing app.ts does not start a server as a side effect.
const server = app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

let isShuttingDown = false;

// Stop accepting requests before closing the queue and database connections.
/** Gracefully closes HTTP, Redis, and both database clients when the process stops. */
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await auditQueue.close();
  await connection.quit();
  await Promise.all([prisma.$disconnect(), auditPrisma.$disconnect()]);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch((error) => {
      console.error('API shutdown failed:', error);
      process.exitCode = 1;
    });
  });
}

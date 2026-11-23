import 'dotenv/config';
// Process entry point for the API; app.ts defines routes while this file owns listening and shutdown.
import { app } from './app';
import { prisma } from './infrastructure/database/main.client';
import { auditPrisma } from './infrastructure/database/audit.client';
import { connection } from './infrastructure/redis/redis.client';
import { auditQueue } from './infrastructure/redis/audit.queue';

// Keep the listen port configurable for local runs and container deployments.
const port = Number(process.env.PORT) || 3000;
// Bind to every network interface so another device on the same LAN can reach this development API.
const host = process.env.HOST || '0.0.0.0';
// Starting the listener belongs here so importing app.ts does not start a server as a side effect.
const server = app.listen(port, host, () => {
  console.log(`API listening on ${host}:${port}; remote clients must use this computer's LAN IP`);
});

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

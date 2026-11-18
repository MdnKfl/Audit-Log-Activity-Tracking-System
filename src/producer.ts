import { randomUUID } from 'crypto';
import { auditQueue } from './queues/audit-log.queue';
import { connection } from './config/redis';

async function main() {
const eventId =randomUUID();
  const event = {
    eventId,
    userId: 'user-123', 
    action: 'TEST_EVENT',
    entity: 'TEST',
    entityId: 'test-1',
    description: 'My first audit event',
    metadata: { source: 'producer script' },
    occurredAt: new Date().toISOString(),
  };

  await auditQueue.add('audit.log', event, { jobId: eventId });
  console.log('Job added with eventId:', eventId);
  
  await auditQueue.close(); 
  await connection.quit();
}

main().catch((err) => {
  console.error('Failed to enqueue:', err);
  process.exit(1);
});
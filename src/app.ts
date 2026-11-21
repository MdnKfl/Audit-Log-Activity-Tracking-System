import express from 'express';
import { requestContext } from './middleware/requestContext';
import { auditLogService } from './modules/audit-log/audit-log.service';
import { auditQueue } from './queues/audit-log.queue';
import { prisma } from './config/prisma.config';

export const app = express();

app.use(express.json());
app.use(requestContext); // must come before the routes

// Demo "business" route: pretend a client was created
app.post('/clients', async (req, res) => {
  const clientId = `client-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  try {
    await auditLogService.log({
      userId: req.get('x-user-id') ?? 'anonymous',
      action: 'CLIENT_CREATED',
      entity: 'CLIENT',
      entityId: clientId,
      description: 'Client created via API',
      metadata: { name: req.body?.name },
    });
  } catch (err) {
    console.error('Audit enqueue failed:', err); // request still succeeds (known trade-off)
  }

  res.status(201).json({ id: clientId });
});

// Queue status: shows jobs waiting, running, done, failed
app.get('/queue-stats', async (_req, res) => {
  res.json(await auditQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'));
});

// Minimal read API (prototype only: no authentication yet)
app.get('/audit-logs', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { action, userId } = req.query as Record<string, string | undefined>;
  const where = { ...(action && { action }), ...(userId && { userId }) };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, page, limit, total });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
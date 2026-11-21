import { Router } from 'express';
// Every audit/queue inspection route checks JWT identity and SUPERADMIN role before the controller runs.
import { auditController } from '../controllers/audit.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware';

export const auditRouter = Router();

// Audit history and its operational metadata are reserved for the superadmin role.
auditRouter.get('/audit-logs', authenticate, requireSuperAdmin, auditController.listAuditLogs);
auditRouter.get('/queue-stats', authenticate, requireSuperAdmin, auditController.queueStats);
auditRouter.get('/outbox-stats', authenticate, requireSuperAdmin, auditController.outboxStats);

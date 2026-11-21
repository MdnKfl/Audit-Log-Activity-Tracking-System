import { Router } from 'express';
// Audit database and Redis queue inspection require JWT identity plus the SUPERADMIN role.
import { auditController } from '../controllers/audit.controller';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware';

/** Endpoints for permanent audit history and queue health; all require a superadmin JWT. */
export const auditRouter = Router();

// Audit history and its operational metadata are reserved for the superadmin role.
auditRouter.get('/audit-logs', authenticate, requireSuperAdmin, auditController.listAuditLogs);
// Queue counts show transport health, not audit record contents.
auditRouter.get('/queue-stats', authenticate, requireSuperAdmin, auditController.queueStats);

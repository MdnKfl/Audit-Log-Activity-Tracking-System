import type { Request, Response } from 'express';
// HTTP adapter for superadmin-only audit queries and queue/outbox status endpoints.
import { auditQueryService } from '../services/audit-query.service';
import { auditLogQuerySchema } from '../validators/audit.validator';
import { getAuthContext } from '../middleware/auth.middleware';

export const auditController = {
  async queueStats(_req: Request, res: Response) {
    res.json(await auditQueryService.queueStats());
  },

  async outboxStats(_req: Request, res: Response) {
    res.json(await auditQueryService.outboxStats());
  },

  async listAuditLogs(req: Request, res: Response) {
    const query = auditLogQuerySchema.parse(req.query);
    const admin = getAuthContext(res);
    res.json(await auditQueryService.listAuditLogs(query, admin.userId, admin.role));
  },
};

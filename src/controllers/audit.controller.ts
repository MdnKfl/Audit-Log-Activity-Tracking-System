import type { Request, Response } from 'express';
// HTTP adapter for superadmin-only audit database queries and Redis queue status.
import { auditQueryService } from '../services/audit-query.service';
import { auditLogQuerySchema } from '../validators/audit.validator';
import { getAuthContext } from '../middleware/auth.middleware';

export const auditController = {
  /** Returns Redis job counts for superadmins monitoring the queue. */
  async queueStats(_req: Request, res: Response) {
    res.json(await auditQueryService.queueStats());
  },

  /** Parses paging/filter parameters before asking the service for audit-database records. */
  async listAuditLogs(req: Request, res: Response) {
    const query = auditLogQuerySchema.parse(req.query);
    const admin = getAuthContext(res);
    res.json(await auditQueryService.listAuditLogs(query, admin.userId, admin.role));
  },
};

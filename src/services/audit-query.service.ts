import { auditService } from './audit.service';
import { auditRepository } from '../repositories/audit.repository';
import { auditQueue } from '../infrastructure/redis/audit.queue';
import { transactionManager } from '../infrastructure/database/transaction';
import type { AuditLogQuery } from '../validators/audit.validator';

/** Read-only audit/queue workflows; audit records always come from the separate audit database. */
export const auditQueryService = {
  /** Reads BullMQ counts for operations monitoring; this does not read either database. */
  queueStats() {
    return auditQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  },

  /** Queries permanent audit rows and queues an AUDIT_LOGS_VIEWED event with the viewer identity. */
  async listAuditLogs(query: AuditLogQuery, adminId: string, adminRole: 'USER' | 'ADMIN' | 'SUPERADMIN') {
    const where = {
      ...(query.eventType && { eventType: query.eventType }),
      ...(query.actorId && { actorId: query.actorId }),
    };
    // Read history from permanent audit storage, never from the transactional outbox.
    const [items, total] = await Promise.all([
      auditRepository.findMany(where, (query.page - 1) * query.limit, query.limit),
      auditRepository.count(where),
    ]);

    // Reading sensitive history is itself recorded through the normal outbox pipeline.
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType: 'AUDIT_LOGS_VIEWED',
      actor: { type: 'USER', id: adminId, role: adminRole },
      resource: { type: 'AUDIT_LOGS' },
      outcome: 'SUCCESS',
      metadata: {
        page: query.page,
        limit: query.limit,
        ...(query.eventType && { eventType: query.eventType }),
        ...(query.actorId && { actorId: query.actorId }),
      },
    }));

    return { items, page: query.page, limit: query.limit, total };
  },
};

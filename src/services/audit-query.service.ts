import { auditService } from './audit.service';
import { auditRepository } from '../repositories/audit.repository';
import { outboxRepository } from '../repositories/outbox.repository';
import { auditQueue } from '../infrastructure/redis/audit.queue';
import { transactionManager } from '../infrastructure/database/transaction';
import type { AuditLogQuery } from '../validators/audit.validator';

export const auditQueryService = {
  queueStats() {
    return auditQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  },

  async outboxStats() {
    const groups = await outboxRepository.countByStatus();
    return Object.fromEntries(groups.map(({ status, _count }) => [status.toLowerCase(), _count._all]));
  },

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

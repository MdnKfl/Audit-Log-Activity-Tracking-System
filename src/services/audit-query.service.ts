import { auditService } from './audit.service';
import { auditRepository } from '../repositories/audit.repository';
import { auditQueue } from '../infrastructure/redis/audit.queue';
import { transactionManager } from '../infrastructure/database/transaction';
import type { AuditLogQuery } from '../validators/audit.validator';

/** Formats a stored instant as ISO-like Nepal time with an explicit +05:45 offset. */
function toNepalTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}+05:45`;
}

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

    // Keep UTC in both databases; convert only the API presentation so the original instant is preserved.
    const localizedItems = items.map((item) => ({
      ...item,
      occurredAt: toNepalTime(item.occurredAt),
      createdAt: toNepalTime(item.createdAt),
    }));
    return { items: localizedItems, page: query.page, limit: query.limit, total };
  },
};

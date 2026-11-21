import { Prisma } from '../../generated/audit-client/client';
// Persistence adapter for permanent audit rows in the separate audit database.
import { auditPrisma } from '../infrastructure/database/audit.client';
import type { AuditEvent } from '../types/audit.types';

/** Permanent audit database operations used only by the worker and superadmin audit-query service. */
export const auditRepository = {
  // This targets permanent audit storage; outbox writes belong to outbox.repository.ts.
  /** Inserts one validated event into permanent audit history. */
  insert(event: AuditEvent) {
    return auditPrisma.auditLog.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        actorId: event.actor.id,
        actorType: event.actor.type,
        resourceType: event.resource.type,
        resourceId: event.resource.id,
        outcome: event.outcome,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
        occurredAt: new Date(event.occurredAt),
      },
    });
  },

  /** Returns a page of audit records using filters supplied by the validated query service. */
  findMany(where: Prisma.AuditLogWhereInput, skip: number, take: number) {
    return auditPrisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { occurredAt: 'desc' },
    });
  },

  /** Counts matching records so the API can report pagination totals. */
  count(where: Prisma.AuditLogWhereInput) {
    return auditPrisma.auditLog.count({ where });
  },
};

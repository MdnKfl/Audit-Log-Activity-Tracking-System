import type { Prisma } from '../../generated/main-client/client';
// Persistence adapter for pending audit events in the main database (not permanent audit history).
import { prisma } from '../infrastructure/database/main.client';
import type { AuditEvent } from '../types/audit.types';

/** Main-database persistence for events waiting to be published; workers do not query this repository. */
export const outboxRepository = {
  // Called with the business transaction client so the outbox event commits with the user change.
  /** Writes the event's searchable columns to internal publisher storage. */
  insert(tx: Prisma.TransactionClient, event: AuditEvent) {
    return tx.outboxEvent.create({
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
};

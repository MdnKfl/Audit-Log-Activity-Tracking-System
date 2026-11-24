
import type { Prisma } from '../../generated/main-client/client';
import { prisma } from '../infrastructure/database/main.client';
import type { AuditEvent } from '../types/audit.types';

export const outboxRepository = {
  insert(tx: Prisma.TransactionClient, event: AuditEvent) {
    return tx.outboxEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        actorId: event.actor.id ?? null,
        actorType: event.actor.type,
        resourceType: event.resource.type,
        resourceId: event.resource.id ?? null,
        outcome: event.outcome,
        ...(event.metadata !== undefined && {
          metadata: event.metadata as Prisma.InputJsonValue,
        }),
        occurredAt: new Date(event.occurredAt),
      },
    });
  },
};

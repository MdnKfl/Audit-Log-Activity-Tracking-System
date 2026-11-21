import { randomUUID } from 'node:crypto';
// Builds the shared audit event and writes it to the main DB outbox using the caller's transaction.
import type { Prisma } from '../../generated/main-client/client';
import { getRequestContext } from '../middleware/requestContext';
import { auditEventSchema, type AuditEventInput } from '../types/audit.types';
import { outboxRepository } from '../repositories/outbox.repository';

const sensitiveKey = /password|token|otp|secret|authorization/i;

// Audit metadata may contain request data, so remove secrets recursively before persistence.
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, item]) => [key, redact(item)]),
    );
  }
  return value;
}

export const auditService = {
  record(
    tx: Prisma.TransactionClient,
    input: AuditEventInput,
  ) {
    // This writes to the main database outbox; the worker stores permanent audit rows later.
    const request = getRequestContext();
    const { role: actorRole, ...eventActor } = input.actor;
    const metadata = {
      ...input.metadata,
      ...(actorRole && { actorRole }),
      ...(request?.ip && { ipAddress: request.ip }),
      ...(request?.userAgent && { userAgent: request.userAgent }),
    };
    const event = auditEventSchema.parse({
      ...input,
      actor: eventActor,
      metadata: Object.keys(metadata).length ? redact(metadata) : undefined,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    return outboxRepository.insert(tx, event);
  },
};

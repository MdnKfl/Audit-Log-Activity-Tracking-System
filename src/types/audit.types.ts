import { z } from 'zod';

// Shared event interface and runtime validator used before outbox writes and after Redis delivery.
export const auditEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(100),
  actor: z.object({
    type: z.enum(['USER', 'SYSTEM', 'ANONYMOUS']),
    id: z.string().uuid().optional(),
  }),
  resource: z.object({
    type: z.string().trim().min(1).max(100),
    id: z.string().uuid().optional(),
  }),
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  metadata: z.record(z.string(), z.json()).optional(),
  occurredAt: z.string().datetime(),
});

/** Serialized event shape shared by the API, Redis publisher, worker, and audit database. */
export type AuditEvent = z.infer<typeof auditEventSchema>;
/** Authenticated role is copied into metadata for later attribution; it is not part of the queue actor contract. */
export type AuditActor = AuditEvent['actor'] & { role?: 'USER' | 'ADMIN' | 'SUPERADMIN' };
export type AuditEventInput = Omit<AuditEvent, 'eventId' | 'occurredAt' | 'actor'> & { actor: AuditActor };

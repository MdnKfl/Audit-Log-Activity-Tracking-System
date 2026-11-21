import { z } from 'zod';

/** Runtime wire contract: rejects malformed events before outbox persistence or after Redis delivery. */
export const auditEventSchema = z.object({
  // Stable ID used as the Redis job ID and unique key in permanent audit storage.
  eventId: z.string().uuid(),
  // Named operation such as USER_UPDATED or ADMIN_CREATED.
  eventType: z.string().trim().min(1).max(100),
  // Person or process that initiated the event.
  actor: z.object({
    type: z.enum(['USER', 'SYSTEM', 'ANONYMOUS']),
    id: z.string().uuid().optional(),
  }),
  // Record the kind of object affected, with an ID when that object has one.
  resource: z.object({
    type: z.string().trim().min(1).max(100),
    id: z.string().uuid().optional(),
  }),
  // SUCCESS/FAILURE records the result without storing credentials or response bodies.
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  // Safe contextual details such as changed field names, request IP, or validation failure reason.
  metadata: z.record(z.string(), z.json()).optional(),
  // ISO timestamp set when the application creates the event, before it enters the outbox.
  occurredAt: z.string().datetime(),
});

/** Serialized event shape shared by the API, Redis publisher, worker, and audit database. */
export type AuditEvent = z.infer<typeof auditEventSchema>;
/** Actor role is copied into metadata so audit rows identify each admin's privilege level. */
export type AuditActor = AuditEvent['actor'] & { role?: 'USER' | 'ADMIN' | 'SUPERADMIN' };
/** Input before the service generates eventId and occurredAt timestamps. */
export type AuditEventInput = Omit<AuditEvent, 'eventId' | 'occurredAt' | 'actor'> & { actor: AuditActor };

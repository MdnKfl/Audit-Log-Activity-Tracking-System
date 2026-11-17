import { z } from 'zod';

// What the CALLER provides (used by the service later)
export const auditInputSchema = z.object({
  userId: z.string().optional(),
  action: z.string().min(1).max(100),
  entity: z.string().min(1).max(100),
  entityId: z.string().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// The FULL event in the queue (caller input + system fields)
export const auditEventSchema = auditInputSchema.extend({
  eventId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  occurredAt: z.string().datetime(),
});
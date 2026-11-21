import { z } from 'zod';

// Parses and bounds query-string values before they reach audit database queries.
/** Converts URL strings into bounded paging/filter values before the audit repository is queried. */
export const auditLogQuerySchema = z.object({
  page: z.preprocess((value) => value === undefined ? 1 : Number(value), z.number().int().min(1)),
  limit: z.preprocess((value) => value === undefined ? 20 : Number(value), z.number().int().min(1).max(100)),
  eventType: z.string().optional(),
  actorId: z.string().uuid().optional(),
});

/** Type inferred from the validator so services receive already-normalized query values. */
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

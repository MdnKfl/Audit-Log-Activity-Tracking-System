import { randomUUID } from 'crypto';
import { auditQueue } from '../../queues/audit-log.queue';
import { auditInputSchema } from './audit-log.vaalidator';
import { getRequestContext } from '../../middleware/requestContext';

const SENSITIVE_KEY = /password|token|otp|secret|authorization/i;

// Drop sensitive keys before anything is queued or stored
function redact(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !SENSITIVE_KEY.test(key)),
  );
}

export const auditLogService = {
  async log(input: unknown): Promise<string> {
    const data = auditInputSchema.parse(input);   // validate the caller's input (throws if invalid)
    const ctx = getRequestContext();

    const event = {
      ...data,
      metadata: redact(data.metadata),
      eventId: randomUUID(),
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
      occurredAt: new Date().toISOString(),
    };

    await auditQueue.add('audit.log', event, { jobId: event.eventId });
    return event.eventId;
  },
};
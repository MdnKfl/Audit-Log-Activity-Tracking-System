import 'dotenv/config';
import { Pool } from 'pg';
import { Prisma } from '../../generated/audit-client/client';
import { auditPrisma } from '../infrastructure/database/audit.client';

// The old audit table lives in the main database; rows are copied out before that table is removed.
const mainUrl = process.env.DATABASE_URL;
if (!mainUrl) throw new Error('DATABASE_URL must be set');

// Dedicated SQL connection reads the old schema, which no longer exists in the current Prisma model.
const mainPool = new Pool({ connectionString: mainUrl });
// Legacy identifiers are not guaranteed to be UUIDs, while the new schema requires UUID actor/resource IDs.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Removes credential-like properties while preserving safe context from legacy metadata. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !/password|token|otp|secret|authorization/i.test(key))
        .map(([key, item]) => [key, redact(item)]),
    );
  }
  return value;
}

/** Copies legacy rows in ordered batches and skips event IDs already imported in an earlier run. */
async function migrate() {
  // Older versions stored audit rows beside business data; copy them to permanent audit storage.
  const { rows: [table] } = await mainPool.query("SELECT to_regclass('public.audit_logs') AS name");
  if (!table.name) {
    console.log('No legacy audit_logs table found; nothing to copy.');
    return;
  }

  let cursorDate = new Date(0);
  let cursorId = '00000000-0000-0000-0000-000000000000';
  let copied = 0;

  while (true) {
    // Keyset pagination keeps memory bounded and avoids large OFFSET scans.
    const { rows } = await mainPool.query(
      `SELECT "eventId", "userId", action, entity, "entityId", description, metadata,
              "ipAddress", "userAgent", "createdAt", id
         FROM audit_logs
        WHERE ("createdAt", id) > ($1::timestamptz, $2::uuid)
        ORDER BY "createdAt", id
        LIMIT 250`,
      [cursorDate, cursorId],
    );
    if (rows.length === 0) break;

    const data = rows.map((row) => {
      const actorId = typeof row.userId === 'string' && uuidPattern.test(row.userId) ? row.userId : undefined;
      const resourceId = typeof row.entityId === 'string' && uuidPattern.test(row.entityId) ? row.entityId : undefined;
      const legacyMetadata = Object.fromEntries(Object.entries({
        description: row.description ?? undefined,
        legacyMetadata: row.metadata ?? undefined,
        ipAddress: row.ipAddress ?? undefined,
        userAgent: row.userAgent ?? undefined,
      }).filter(([, value]) => value !== undefined));
      const metadata = redact(legacyMetadata) as Prisma.InputJsonValue;
      return {
        eventId: row.eventId,
        eventType: String(row.action).slice(0, 100),
        actorId,
        actorType: actorId ? 'USER' : 'ANONYMOUS',
        resourceType: String(row.entity).slice(0, 100),
        resourceId,
        outcome: 'SUCCESS',
        metadata,
        occurredAt: new Date(row.createdAt),
      };
    });

    await auditPrisma.auditLog.createMany({ data, skipDuplicates: true });
    copied += rows.length;
    const last = rows[rows.length - 1];
    cursorDate = new Date(last.createdAt);
    cursorId = last.id;
  }

  console.log(`Copied or already migrated ${copied} legacy audit rows.`);
}

/** Owns cleanup for both database connections even when the copy operation fails. */
async function main() {
  try {
    await migrate();
  } finally {
    await Promise.all([mainPool.end(), auditPrisma.$disconnect()]);
  }
}

void main().catch((error) => {
  console.error('Could not migrate legacy audit rows:', error);
  process.exitCode = 1;
});

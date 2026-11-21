import 'dotenv/config';
// Prisma connection for permanent audit_logs only; the audit worker and audit repository use this client.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/audit-client/client';

// Fail early when permanent audit storage is not configured for the API or worker.
const connectionString = process.env.AUDIT_DATABASE_URL;
if (!connectionString) throw new Error('AUDIT_DATABASE_URL must be set');

// Permanent audit history is isolated from business data and the outbox database.
const adapter = new PrismaPg({ connectionString, max: 10 });
/** Shared Prisma client for permanent audit_logs records only. */
export const auditPrisma = new PrismaClient({ adapter });

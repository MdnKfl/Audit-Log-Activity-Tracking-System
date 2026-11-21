import 'dotenv/config';
// Prisma connection for business users and outbox events; services use it via repositories/transactions.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/main-client/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be set');

// Owns business tables and the transactional outbox, not permanent audit history.
const adapter = new PrismaPg({ connectionString, max: 10 });
export const prisma = new PrismaClient({ adapter });

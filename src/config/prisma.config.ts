import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 10 });
export const prisma = new PrismaClient({ adapter });
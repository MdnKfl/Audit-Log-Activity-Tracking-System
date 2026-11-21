import type { Prisma } from '../../../generated/main-client/client';
// Shared transaction boundary for business changes plus outbox writes in the main database.
import { prisma } from './main.client';

// All business mutations and their outbox rows must use this same transaction client.
export const transactionManager = {
  execute<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(operation);
  },
};

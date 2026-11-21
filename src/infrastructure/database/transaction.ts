import type { Prisma } from '../../../generated/main-client/client';
// Shared transaction boundary for business changes plus outbox writes in the main database.
import { prisma } from './main.client';

// All business mutations and their outbox rows must use this same transaction client.
/** Small wrapper that gives services one consistent main-database transaction boundary. */
export const transactionManager = {
  /** Commits the callback's database work together or rolls it all back if it rejects. */
  execute<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(operation);
  },
};

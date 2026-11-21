import { prisma } from '../infrastructure/database/main.client';
// Main-database queries for user records; this layer returns safe user fields, never password hashes.
import type { Prisma } from '../../generated/main-client/client';

const publicUserSelect = {
  id: true,
  fullName: true,
  address: true,
  phoneNumber: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const userRepository = {
  // Keep Prisma calls in this layer so services do not depend on query details.
  create(tx: Prisma.TransactionClient, data: {
    fullName: string;
    address: string;
    phoneNumber: string;
    email: string;
    passwordHash: string;
  }) {
    return tx.user.create({ data, select: publicUserSelect });
  },

  findAll() {
    return prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: publicUserSelect });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },

  findPrincipalById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  },

  findCredentialsByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, passwordHash: true } });
  },

  update(tx: Prisma.TransactionClient, id: string, data: {
    fullName?: string;
    address?: string;
    phoneNumber?: string;
    email?: string;
  }) {
    return tx.user.update({ where: { id }, data, select: publicUserSelect });
  },

  updatePassword(tx: Prisma.TransactionClient, id: string, passwordHash: string) {
    return tx.user.update({ where: { id }, data: { passwordHash }, select: publicUserSelect });
  },

  delete(tx: Prisma.TransactionClient, id: string) {
    return tx.user.delete({ where: { id }, select: publicUserSelect });
  },
};

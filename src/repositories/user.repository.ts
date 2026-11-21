import { prisma } from '../infrastructure/database/main.client';
// Main-database queries for user records; this layer returns safe user fields, never password hashes.
import type { Prisma } from '../../generated/main-client/client';

// Shared select list keeps credential hashes out of every profile response.
const publicUserSelect = {
  id: true,
  fullName: true,
  address: true,
  phoneNumber: true,
  username: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Main-database query methods used by user/auth services; mutation methods accept a caller transaction. */
export const userRepository = {
  // Keep Prisma calls in this layer so services do not depend on query details.
  /** Inserts a regular user or administrator through the supplied transaction. */
  create(tx: Prisma.TransactionClient, data: {
    fullName: string;
    address?: string;
    phoneNumber?: string;
    email?: string;
    passwordHash: string;
    username?: string;
    role?: string;
  }) {
    return tx.user.create({ data, select: publicUserSelect });
  },

  /** Lists safe user profiles for admin views. */
  findAll() {
    return prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: publicUserSelect });
  },

  /** Looks up one safe profile without exposing the password hash. */
  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },

  /** Loads only identity and role so JWT middleware can enforce current permissions. */
  findPrincipalById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  },

  /** Loads password hash only for credential verification; callers must never return this row. */
  findCredentialsByIdentity(identity: { type: 'email' | 'username'; value: string }) {
    const where = identity.type === 'email' ? { email: identity.value } : { username: identity.value };
    return prisma.user.findUnique({ where, select: {
      id: true,
      email: true,
      username: true,
      role: true,
      passwordHash: true,
    } });
  },

  /** Updates allowed profile/login fields using the caller's transaction. */
  update(tx: Prisma.TransactionClient, id: string, data: {
    fullName?: string;
    address?: string;
    phoneNumber?: string;
    email?: string;
    username?: string;
  }) {
    return tx.user.update({ where: { id }, data, select: publicUserSelect });
  },

  /** Replaces a password hash within the same transaction as its audit event. */
  updatePassword(tx: Prisma.TransactionClient, id: string, passwordHash: string) {
    return tx.user.update({ where: { id }, data: { passwordHash }, select: publicUserSelect });
  },

  /** Deletes a user within the caller's audit-aware transaction. */
  delete(tx: Prisma.TransactionClient, id: string) {
    return tx.user.delete({ where: { id }, select: publicUserSelect });
  },
};

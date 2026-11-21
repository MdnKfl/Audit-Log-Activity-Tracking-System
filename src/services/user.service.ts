// User business workflows live here, including their transaction-scoped audit events.
import { userRepository } from '../repositories/user.repository';
import { createAdminSchema, createUserSchema, resetPasswordSchema, updateUserSchema, userIdSchema } from '../validators/user.validator';
import { auditService } from './audit.service';
import type { AuditActor } from '../types/audit.types';
import { transactionManager } from '../infrastructure/database/transaction';
import { hashPassword } from '../security/password';
import { ZodError } from 'zod';

/** Lets the HTTP error handler distinguish a missing user from an unexpected database failure. */
export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}

export const userService = {
  // Validation and business decisions live here; the repository owns persistence.
  /** Creates a regular user and audit event atomically in the main database. */
  async create(input: unknown, actor: AuditActor, eventType = 'USER_CREATED') {
    const data = createUserSchema.parse(input);
    const passwordHash = await hashPassword(data.password);
    // The user row and its audit outbox event either commit together or are both rolled back.
    return transactionManager.execute(async (tx) => {
      const user = await userRepository.create(tx, {
        fullName: data.fullName,
        address: data.address,
        phoneNumber: data.phoneNumber,
        email: data.email,
        passwordHash,
      });
      await auditService.record(tx, {
        eventType,
        actor,
        resource: { type: 'USER', id: user.id },
        outcome: 'SUCCESS',
        metadata: { changedFields: ['fullName', 'address', 'phoneNumber', 'email'] },
      });
      return user;
    });
  },

  /** Creates an ADMIN for a superadmin and audits both successful and rejected attempts. */
  async createAdmin(input: unknown, actor: AuditActor) {
    try {
      const data = createAdminSchema.parse(input);
      const passwordHash = await hashPassword(data.password);
      return await transactionManager.execute(async (tx) => {
        const admin = await userRepository.create(tx, {
          fullName: data.fullName,
          username: data.username,
          address: data.address,
          phoneNumber: data.phoneNumber,
          email: data.email,
          passwordHash,
          role: 'ADMIN',
        });
        await auditService.record(tx, {
          eventType: 'ADMIN_CREATED',
          actor,
          resource: { type: 'USER', id: admin.id },
          outcome: 'SUCCESS',
          metadata: { username: admin.username },
        });
        return admin;
      });
    } catch (error) {
      // Keep failed creation attempts attributable to the superadmin, without recording credentials.
      try {
        await transactionManager.execute((tx) => auditService.record(tx, {
          eventType: 'ADMIN_CREATION_FAILED',
          actor,
          resource: { type: 'ADMIN_ACCOUNT' },
          outcome: 'FAILURE',
          metadata: { reason: error instanceof ZodError ? 'validation_failed' : 'creation_rejected' },
        }));
      } catch (auditError) {
        console.error('Could not enqueue failed admin-creation audit event:', auditError);
      }
      throw error;
    }
  },

  /** Returns safe user profiles and writes an audit event describing the list read. */
  async list(actor: AuditActor) {
    const users = await userRepository.findAll();
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType: 'USER_LIST_VIEWED',
      actor,
      resource: { type: 'USER_COLLECTION' },
      outcome: 'SUCCESS',
      metadata: { resultCount: users.length },
    }));
    return users;
  },

  /** Fetches one safe profile and records the actor who viewed that user. */
  async get(id: unknown, actor: AuditActor) {
    const validId = userIdSchema.parse(id);
    const user = await userRepository.findById(validId);
    if (!user) throw new UserNotFoundError();
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType: 'USER_VIEWED',
      actor,
      resource: { type: 'USER', id: user.id },
      outcome: 'SUCCESS',
    }));
    return user;
  },

  /** Updates profile or login identity fields and commits the matching audit event in the same transaction. */
  async update(id: unknown, input: unknown, actor: AuditActor) {
    const validId = userIdSchema.parse(id);
    const data = updateUserSchema.parse(input);
    // Pass the transaction client through both repositories to preserve outbox atomicity.
    return transactionManager.execute(async (tx) => {
      // Let the database perform the update directly; a missing row aborts the whole transaction.
      const user = await userRepository.update(tx, validId, data);
      await auditService.record(tx, {
        eventType: 'USER_UPDATED',
        actor,
        resource: { type: 'USER', id: user.id },
        outcome: 'SUCCESS',
        metadata: { changedFields: Object.keys(data) },
      });
      return user;
    });
  },

  /** Deletes a user and its success event atomically so no deletion is left unaudited. */
  async delete(id: unknown, actor: AuditActor) {
    const validId = userIdSchema.parse(id);
    await transactionManager.execute(async (tx) => {
      const user = await userRepository.delete(tx, validId);
      await auditService.record(tx, {
        eventType: 'USER_DELETED',
        actor,
        resource: { type: 'USER', id: user.id },
        outcome: 'SUCCESS',
      });
    });
  },

  /** Hashes and replaces a password, while auditing only that the password field changed. */
  async resetPassword(id: unknown, input: unknown, actor: AuditActor) {
    const validId = userIdSchema.parse(id);
    const { password } = resetPasswordSchema.parse(input);
    const passwordHash = await hashPassword(password);
    return transactionManager.execute(async (tx) => {
      const user = await userRepository.updatePassword(tx, validId, passwordHash);
      await auditService.record(tx, {
        eventType: 'USER_PASSWORD_RESET',
        actor,
        resource: { type: 'USER', id: user.id },
        outcome: 'SUCCESS',
        metadata: { changedFields: ['password'] },
      });
      return user;
    });
  },
};

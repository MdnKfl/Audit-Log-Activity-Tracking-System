// User business workflows live here, including their transaction-scoped audit events.
import { userRepository } from '../repositories/user.repository';
import { createUserSchema, resetPasswordSchema, updateUserSchema, userIdSchema } from '../validators/user.validator';
import { auditService } from './audit.service';
import type { AuditActor } from '../types/audit.types';
import { transactionManager } from '../infrastructure/database/transaction';
import { hashPassword } from '../security/password';

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}

export const userService = {
  // Validation and business decisions live here; the repository owns persistence.
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

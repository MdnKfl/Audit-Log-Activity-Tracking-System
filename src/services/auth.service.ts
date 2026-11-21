// Owns registration/login decisions and their success/failure audit events; routes remain public.
import { z, ZodError } from 'zod';
import { auditService } from './audit.service';
import { transactionManager } from '../infrastructure/database/transaction';
import { userRepository } from '../repositories/user.repository';
import { createUserSchema, emailSchema, passwordSchema, usernameSchema } from '../validators/user.validator';
import { createAccessToken, accessTokenLifetimeSeconds } from '../security/jwt';
import { hashPassword, verifyPassword } from '../security/password';

// Accept exactly one login identity so normal users can use email and admins can use username.
const loginSchema = z.object({
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
  password: passwordSchema,
}).refine((credentials) => Boolean(credentials.email) !== Boolean(credentials.username), {
  message: 'Provide either email or username',
});

/** Gives the HTTP error handler one generic response for an unknown identity or wrong password. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email/username or password');
    this.name = 'InvalidCredentialsError';
  }
}

// Authentication failures should be audited without logging submitted credentials or masking the API error.
/** Best-effort audit write for requests that fail before a business transaction can commit. */
async function recordFailure(eventType: string, resourceType: string, reason: string) {
  try {
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType,
      actor: { type: 'ANONYMOUS' },
      resource: { type: resourceType },
      outcome: 'FAILURE',
      metadata: { reason },
    }));
  } catch (error) {
    console.error(`Could not enqueue ${eventType} audit event:`, error);
  }
}

/** Authentication workflows shared by the public auth controller and user account provisioning. */
export const authService = {
  /** Validates registration, stores a password hash, and writes USER_REGISTERED with the new account. */
  async register(input: unknown) {
    try {
      const data = createUserSchema.parse(input);
      const passwordHash = await hashPassword(data.password);

      return await transactionManager.execute(async (tx) => {
        const user = await userRepository.create(tx, {
          fullName: data.fullName,
          address: data.address,
          phoneNumber: data.phoneNumber,
          email: data.email,
          passwordHash,
        });
        await auditService.record(tx, {
          eventType: 'USER_REGISTERED',
          actor: { type: 'USER', id: user.id, role: 'USER' },
          resource: { type: 'USER', id: user.id },
          outcome: 'SUCCESS',
          metadata: { changedFields: ['fullName', 'address', 'phoneNumber', 'email'] },
        });
        return user;
      });
    } catch (error) {
      await recordFailure(
        'USER_REGISTRATION_FAILED',
        'USER_REGISTRATION',
        error instanceof ZodError ? 'validation_failed' : 'registration_rejected',
      );
      throw error;
    }
  },

  /** Verifies credentials, records the result, anandd issues a JWT only after a successful audit write. */
  async login(input: unknown) {
    // Parse and normalize input before looking up credentials or creating audit records.
    let credentials: z.infer<typeof loginSchema>;
    try {
      credentials = loginSchema.parse(input);
    } catch (error) {
      await recordFailure(
        'AUTH_LOGIN_FAILED',
        'AUTH_SESSION',
        error instanceof ZodError ? 'validation_failed' : 'invalid_credentials',
      );
      throw error;
    }
    const identity = credentials.email
      ? { type: 'email' as const, value: credentials.email }
      : { type: 'username' as const, value: credentials.username! };
    const user = await userRepository.findCredentialsByIdentity(identity);
    const accepted = user?.passwordHash
      ? await verifyPassword(credentials.password, user.passwordHash)
      : false;

    if (!user || !accepted) {
      // Record failures in their own transaction because no business mutation occurred.
      await recordFailure('AUTH_LOGIN_FAILED', 'AUTH_SESSION', 'invalid_credentials');
      throw new InvalidCredentialsError();
    }

    const accessToken = await createAccessToken(user.id);
    // Return only after the successful-login audit event has committed to the outbox.
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType: 'AUTH_LOGIN_SUCCEEDED',
      actor: {
        type: 'USER',
        id: user.id,
        role: user.role === 'SUPERADMIN' ? 'SUPERADMIN' : user.role === 'ADMIN' ? 'ADMIN' : 'USER',
      },
      resource: { type: 'AUTH_SESSION' },
      outcome: 'SUCCESS',
    }));

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenLifetimeSeconds,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    };
  },
};

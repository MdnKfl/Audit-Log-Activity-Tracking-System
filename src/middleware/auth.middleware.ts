import type { Request, Response, NextFunction, RequestHandler } from 'express';
// HTTP security middleware: verifies bearer JWTs, loads current roles, and enforces route access rules.
import { auditService } from '../services/audit.service';
import type { AuditActor } from '../types/audit.types';
import { transactionManager } from '../infrastructure/database/transaction';
import { userRepository } from '../repositories/user.repository';
import { verifyAccessToken } from '../security/jwt';

export type AuthContext = { userId: string; role: 'USER' | 'ADMIN' | 'SUPERADMIN' };

export function getAuthContext(res: Response): AuthContext {
  const context = (res.locals as { auth?: AuthContext }).auth;
  if (!context) throw new Error('Authentication middleware was not applied');
  return context;
}

async function recordAuthEvent(
  eventType: string,
  actor: AuditActor,
  outcome: 'SUCCESS' | 'FAILURE',
  metadata?: Record<string, string>,
) {
  try {
    await transactionManager.execute((tx) => auditService.record(tx, {
      eventType,
      actor,
      resource: { type: 'AUTHENTICATION' },
      outcome,
      metadata,
    }));
  } catch (error) {
    // Auth responses should remain generic even if the audit database path is unavailable.
    console.error('Could not enqueue authentication audit event:', error);
  }
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    await recordAuthEvent('AUTH_TOKEN_REJECTED', { type: 'ANONYMOUS' }, 'FAILURE', { reason: 'missing_bearer_token' });
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  let userId: string;
  try {
    userId = await verifyAccessToken(match[1]);
  } catch {
    await recordAuthEvent('AUTH_TOKEN_REJECTED', { type: 'ANONYMOUS' }, 'FAILURE', { reason: 'invalid_or_expired_token' });
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  // Read the current role so role changes take effect before a token expires.
  const principal = await userRepository.findPrincipalById(userId);
  if (!principal) {
    await recordAuthEvent('AUTH_TOKEN_REJECTED', { type: 'ANONYMOUS' }, 'FAILURE', { reason: 'user_not_found' });
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  res.locals.auth = {
    userId: principal.id,
    role: principal.role === 'SUPERADMIN' ? 'SUPERADMIN' : principal.role === 'ADMIN' ? 'ADMIN' : 'USER',
  } satisfies AuthContext;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const auth = getAuthContext(res);
  if (auth.role === 'ADMIN' || auth.role === 'SUPERADMIN') return next();

  await recordAuthEvent('AUTHORIZATION_DENIED', { type: 'USER', id: auth.userId, role: auth.role }, 'FAILURE', {
    method: req.method,
    path: req.path,
  });
  res.status(403).json({ error: 'Administrator access required' });
};

export const requireSuperAdmin: RequestHandler = async (req, res, next) => {
  const auth = getAuthContext(res);
  if (auth.role === 'SUPERADMIN') return next();

  await recordAuthEvent('AUTHORIZATION_DENIED', { type: 'USER', id: auth.userId, role: auth.role }, 'FAILURE', {
    method: req.method,
    path: req.path,
    requiredRole: 'SUPERADMIN',
  });
  res.status(403).json({ error: 'Superadmin access required' });
};

export const requireSelfOrAdmin: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuthContext(res);
  if (auth.role === 'ADMIN' || auth.role === 'SUPERADMIN' || auth.userId === req.params.id) return next();

  await recordAuthEvent('AUTHORIZATION_DENIED', { type: 'USER', id: auth.userId, role: auth.role }, 'FAILURE', {
    method: req.method,
    path: req.path,
  });
  res.status(403).json({ error: 'You may only access your own user record' });
};

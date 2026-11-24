
import { z } from 'zod';

// Dynamically load jose because it is an ESM-only package.
const josePromise = import('jose');

// JWT configuration
const secret = process.env.JWT_SECRET;

if (!secret || Buffer.byteLength(secret) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes');
}

const key = new TextEncoder().encode(secret);

const issuer = 'audit-log-api';
const audience = 'audit-log-api';

export const accessTokenLifetimeSeconds = 15 * 60;

/** Signs a user ID into a short-lived access token. */
export async function createAccessToken(userId: string) {
  const { SignJWT } = await josePromise;

  return new SignJWT({ tokenUse: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
    .sign(key);
}

/** Verifies the access token and returns its UUID subject. */
export async function verifyAccessToken(token: string) {
  const { jwtVerify } = await josePromise;

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    issuer,
    audience,
  });

  return z.string().uuid().parse(payload.sub);
}

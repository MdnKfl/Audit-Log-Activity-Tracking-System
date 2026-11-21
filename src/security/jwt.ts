import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

// JWT helpers are used by auth.service.ts when issuing tokens and auth.middleware.ts when protecting routes.
// A missing or short secret must stop startup; weak signing keys would make every access token forgeable.
const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes');
}

const key = new TextEncoder().encode(secret);
// Scope tokens to this service so tokens from other applications cannot be reused here.
const issuer = 'audit-log-api';
const audience = 'audit-log-api';
/** Shared expiry used in both the JWT claim and the login response. */
export const accessTokenLifetimeSeconds = 15 * 60;

/** Signs a user ID into a short-lived access token after successful login. */
export function createAccessToken(userId: string) {
  return new SignJWT({ tokenUse: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
    .sign(key);
}

/** Verifies signature, issuer, audience, algorithm, expiry, and UUID subject before returning a user ID. */
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    issuer,
    audience,
  });
  return z.string().uuid().parse(payload.sub);
}

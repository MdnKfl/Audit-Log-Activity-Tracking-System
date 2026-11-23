import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

/** Small request-local values auditService may attach to events. */
type Ctx = { ip?: string; userAgent?: string };

// AsyncLocalStorage keeps metadata attached to the current request across awaited service calls.
const storage = new AsyncLocalStorage<Ctx>();

/** Uses IPv4 loopback for localhost and unwraps IPv4-mapped IPv6 addresses for readable audit metadata. */
function auditIpAddress(address: string | undefined) {
  if (!address) return undefined;
  if (address === '::1') return '127.0.0.1';
  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mappedIpv4?.[1] ?? address;
}

/** Starts a request-local context so audit events can include the request IP and user agent. */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({ ip: auditIpAddress(req.ip), userAgent: req.get('user-agent') }, next);
}

/** Returns metadata for the current request, or undefined when called outside an HTTP request. */
export function getRequestContext() {
  return storage.getStore();
}

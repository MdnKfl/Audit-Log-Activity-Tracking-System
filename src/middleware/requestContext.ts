import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

/** Small request-local values auditService may attach to events. */
type Ctx = { ip?: string; userAgent?: string };

// AsyncLocalStorage keeps metadata attached to the current request across awaited service calls.
const storage = new AsyncLocalStorage<Ctx>();

/** Starts a request-local context so audit events can include the request IP and user agent. */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent') }, next);
}

/** Returns metadata for the current request, or undefined when called outside an HTTP request. */
export function getRequestContext() {
  return storage.getStore();
}

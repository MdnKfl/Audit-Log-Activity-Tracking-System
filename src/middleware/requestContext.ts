import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

type Ctx = { ip?: string; userAgent?: string };

const storage = new AsyncLocalStorage<Ctx>();

// Express middleware: stores this request's IP and user agent
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent') }, next);
}

export function getRequestContext() {
  return storage.getStore();
}
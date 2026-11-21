import type { ErrorRequestHandler } from 'express';
// Converts known validation/database errors into stable HTTP responses after controllers/services throw.
import { Prisma } from '../../generated/main-client/client';
import { ZodError } from 'zod';
import { UserNotFoundError } from '../services/user.service';
import { InvalidCredentialsError } from '../services/auth.service';

/** Maps expected validation/domain/Prisma errors to HTTP statuses and hides unexpected internals. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const details = err.issues.map(({ code, path, message }) => ({ code, path, message }));
    res.status(400).json({ error: 'Invalid request', details });
    return;
  }

  if (err instanceof UserNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof InvalidCredentialsError) {
    res.status(401).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'A user with this email or username already exists' });
    return;
  }

  // Prisma reports a missing row with P2025 when an update or delete cannot match.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

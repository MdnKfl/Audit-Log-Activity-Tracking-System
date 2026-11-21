import type { Request, Response } from 'express';
// HTTP adapter for public registration and login; credential rules stay in auth.service.ts.
import { authService } from '../services/auth.service';

export const authController = {
  /** Creates a public USER account and returns its safe profile fields. */
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body);
    res.status(201).json(user);
  },

  /** Exchanges email/username and password for a short-lived JWT. */
  async login(req: Request, res: Response) {
    res.json(await authService.login(req.body));
  },
};

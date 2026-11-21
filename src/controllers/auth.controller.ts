import type { Request, Response } from 'express';
// HTTP adapter for public registration and login; credential rules stay in auth.service.ts.
import { authService } from '../services/auth.service';

export const authController = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body);
    res.status(201).json(user);
  },

  async login(req: Request, res: Response) {
    res.json(await authService.login(req.body));
  },
};

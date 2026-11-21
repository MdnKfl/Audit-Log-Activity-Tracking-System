import type { Request, Response } from 'express';
// HTTP adapter for user endpoints; business rules stay in user.service.ts.
import { userService } from '../services/user.service';
import type { AuditActor } from '../types/audit.types';
import { getAuthContext } from '../middleware/auth.middleware';

function actorFromResponse(res: Response): AuditActor {
  const auth = getAuthContext(res);
  return { type: 'USER', id: auth.userId, role: auth.role };
}

export const userController = {
  // Controllers translate HTTP requests into service calls and choose response codes.
  async create(req: Request, res: Response) {
    const user = await userService.create(req.body, actorFromResponse(res));
    res.status(201).json(user);
  },

  async list(_req: Request, res: Response) {
    res.json(await userService.list(actorFromResponse(res)));
  },

  async get(req: Request, res: Response) {
    res.json(await userService.get(req.params.id, actorFromResponse(res)));
  },

  async update(req: Request, res: Response) {
    res.json(await userService.update(req.params.id, req.body, actorFromResponse(res)));
  },

  async delete(req: Request, res: Response) {
    await userService.delete(req.params.id, actorFromResponse(res));
    res.status(204).end();
  },

  async resetPassword(req: Request, res: Response) {
    await userService.resetPassword(req.params.id, req.body, actorFromResponse(res));
    res.status(204).end();
  },
};

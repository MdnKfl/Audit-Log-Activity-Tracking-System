import type { Request, Response } from 'express';
// HTTP adapter for user endpoints; business rules stay in user.service.ts.
import { userService } from '../services/user.service';
import type { AuditActor } from '../types/audit.types';
import { getAuthContext } from '../middleware/auth.middleware';

/** Converts verified request identity into the actor shape services attach to audit events. */
function actorFromResponse(res: Response): AuditActor {
  // Services attach this identity to audit events so actions can be traced to a specific account.
  const auth = getAuthContext(res);
  return { type: 'USER', id: auth.userId, role: auth.role };
}

export const userController = {
  // Controllers translate HTTP requests into service calls and choose response codes.
  /** Creates a regular USER account on behalf of an authenticated admin. */
  async create(req: Request, res: Response) {
    const user = await userService.create(req.body, actorFromResponse(res));
    res.status(201).json(user);
  },

  /** Creates an ADMIN account; the route restricts this operation to superadmins. */
  async createAdmin(req: Request, res: Response) {
    const admin = await userService.createAdmin(req.body, actorFromResponse(res));
    res.status(201).json(admin);
  },

  /** Lists users for an admin and passes the actor so the read is audited. */
  async list(_req: Request, res: Response) {
    res.json(await userService.list(actorFromResponse(res)));
  },

  /** Returns one user's public profile and records who viewed it. */
  async get(req: Request, res: Response) {
    res.json(await userService.get(req.params.id, actorFromResponse(res)));
  },

  /** Updates permitted profile/login fields; authorization is enforced by the route middleware. */
  async update(req: Request, res: Response) {
    res.json(await userService.update(req.params.id, req.body, actorFromResponse(res)));
  },

  /** Permanently removes a user and returns HTTP 204 after the transaction succeeds. */
  async delete(req: Request, res: Response) {
    await userService.delete(req.params.id, actorFromResponse(res));
    res.status(204).end();
  },

  /** Changes a user's password without returning or logging the password value. */
  async resetPassword(req: Request, res: Response) {
    await userService.resetPassword(req.params.id, req.body, actorFromResponse(res));
    res.status(204).end();
  },
};

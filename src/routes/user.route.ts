import { Router } from 'express';
// Route declarations make the auth policy visible before reading controller implementations.
import { userController } from '../controllers/user.controller';
import { authenticate, requireAdmin, requireSelfOrAdmin, requireSuperAdmin } from '../middleware/auth.middleware';

/** User-management API; each route declares its JWT and role policy before the controller. */
export const userRouter = Router();

// Admins may create regular users; the superadmin-only route is reserved for creating admins.
userRouter.post('/', authenticate, requireAdmin, userController.create);
userRouter.post('/admins', authenticate, requireSuperAdmin, userController.createAdmin);
// Listing everyone is broader than viewing one profile, so it is admin-only and audited.
userRouter.get('/', authenticate, requireAdmin, userController.list);
// Users can view themselves; admins can view any account.
userRouter.get('/:id', authenticate, requireSelfOrAdmin, userController.get);
// Credentials/profile changes and deletions are admin responsibilities.
userRouter.patch('/:id', authenticate, requireAdmin, userController.update);
userRouter.delete('/:id', authenticate, requireAdmin, userController.delete);
userRouter.patch('/:id/password', authenticate, requireAdmin, userController.resetPassword);

import { Router } from 'express';
// Route declarations make the auth policy visible before reading controller implementations.
import { userController } from '../controllers/user.controller';
import { authenticate, requireAdmin, requireSelfOrAdmin } from '../middleware/auth.middleware';

export const userRouter = Router();

// Routes only map HTTP methods and paths to controller actions.
userRouter.post('/', authenticate, requireAdmin, userController.create);
userRouter.get('/', authenticate, requireAdmin, userController.list);
userRouter.get('/:id', authenticate, requireSelfOrAdmin, userController.get);
userRouter.patch('/:id', authenticate, requireAdmin, userController.update);
userRouter.delete('/:id', authenticate, requireAdmin, userController.delete);
userRouter.patch('/:id/password', authenticate, requireAdmin, userController.resetPassword);

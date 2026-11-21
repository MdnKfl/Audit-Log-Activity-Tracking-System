import { Router } from 'express';
// Registration and login are public; protected routes use authenticate in their own route modules.
import { authController } from '../controllers/auth.controller';

export const authRouter = Router();

authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);

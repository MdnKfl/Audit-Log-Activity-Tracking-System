import { Router } from 'express';
// Registration and login are public; protected routes use authenticate in their own route modules.
import { authController } from '../controllers/auth.controller';

/** Public session routes; login and registration are not protected by a prior JWT. */
export const authRouter = Router();

// Public registration always creates a regular USER account.
authRouter.post('/register', authController.register);
// Public login issues the JWT required by protected user and audit routes.
authRouter.post('/login', authController.login);

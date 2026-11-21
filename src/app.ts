import 'dotenv/config';
// Express application composition: middleware order, route mounting, and final error handling live here.
import express from 'express';
import { requestContext } from './middleware/requestContext';
import { userRouter } from './routes/user.route';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.route';
import { auditRouter } from './routes/audit.route';
import { systemRouter } from './routes/system.route';

/** Exported Express app so routes can be composed here and the server can own process startup. */
export const app = express();

app.use(express.json());
// Capture request metadata before routes so services can read it from async context.
app.use(requestContext);
app.use('/auth', authRouter);
app.use('/users', userRouter);
app.use(auditRouter);
app.use(systemRouter);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Express error middleware must be registered after every route.
app.use(errorHandler);

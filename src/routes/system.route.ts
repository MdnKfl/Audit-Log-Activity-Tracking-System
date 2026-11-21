import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../openapi/openapi';
import { systemController } from '../controllers/system.controller';

export const systemRouter = Router();

systemRouter.get('/health', systemController.health);
systemRouter.get('/openapi.json', systemController.openApi);
systemRouter.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

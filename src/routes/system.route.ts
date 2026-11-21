import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../openapi/openapi';
import { systemController } from '../controllers/system.controller';

/** Public health and API documentation routes used for readiness checks and Swagger. */
export const systemRouter = Router();

// Used by container checks to confirm the API process responds over HTTP.
systemRouter.get('/health', systemController.health);
// Serves the raw OpenAPI JSON consumed by Swagger UI and external tools.
systemRouter.get('/openapi.json', systemController.openApi);
// Interactive browser documentation; endpoint security remains enforced by the routes themselves.
systemRouter.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

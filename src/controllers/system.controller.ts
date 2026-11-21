import type { Request, Response } from 'express';
import { openApiSpec } from '../openapi/openapi';

// HTTP endpoints for process health and the Swagger/OpenAPI document.
export const systemController = {
  /** Simple liveness response used to check that the HTTP process is responding. */
  health(_req: Request, res: Response) {
    res.json({ status: 'ok' });
  },

  /** Serves the OpenAPI contract used by Swagger UI and API clients. */
  openApi(_req: Request, res: Response) {
    res.json(openApiSpec);
  },
};

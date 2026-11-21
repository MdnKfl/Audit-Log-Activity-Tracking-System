import type { Request, Response } from 'express';
import { openApiSpec } from '../openapi/openapi';

export const systemController = {
  health(_req: Request, res: Response) {
    res.json({ status: 'ok' });
  },

  openApi(_req: Request, res: Response) {
    res.json(openApiSpec);
  },
};

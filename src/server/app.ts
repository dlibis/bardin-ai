import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { DatabaseClient, getDatabaseClient } from './db/client.js';
import { createApiRouter } from './routes/api.js';

export function createApp(clientGetter?: () => Promise<DatabaseClient>): Express {
  const app = express();

  app.use(cors());

  // 1 MiB body size limit with custom error handler for 413
  app.use(
    express.json({
      limit: '1mb',
    })
  );

  // Mount API router
  app.use('/api', createApiRouter(clientGetter));

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    });
  });

  // Global Error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds 1 MiB limit',
      });
      return;
    }

    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'INVALID_JSON',
        message: 'Malformed JSON payload',
      });
      return;
    }

    console.error('Unhandled server error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err?.message || 'An unexpected error occurred',
    });
  });

  return app;
}

import type { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { createApiRouter } from './api/routes';
// import { env } from './config/env';
import { GatewayError } from './grpc/handlers';
import type { GrpcGateway } from './grpc/handlers';
import type { Logger } from 'pino';

export const createApp = (gateway: GrpcGateway, logger: Logger): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(
    pinoHttp({
      logger,
      autoLogging: true
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: "*",
      credentials: true
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(createApiRouter(gateway));

  app.use((request: Request, response: Response) => {
    response.status(404).json({ message: `Route not found: ${request.method} ${request.originalUrl}` });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;

    if (error instanceof GatewayError) {
      response.status(error.statusCode).json({ message: error.message });
      return;
    }

    logger.error({ error }, 'Unhandled API error');
    response.status(500).json({ message: 'Internal server error' });
  });

  return app;
};
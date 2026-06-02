import { Router } from 'express';

import { createApiController } from './controller';
import type { GrpcGateway } from '../grpc/handlers';

export const createApiRouter = (gateway: GrpcGateway): Router => {
  const controller = createApiController(gateway);
  const router = Router();

  router.get('/health', controller.health);
  router.get('/services', controller.services);
  router.get('/events', controller.events);
  router.post('/invoke/:service/:method', controller.invoke);

  return router;
};
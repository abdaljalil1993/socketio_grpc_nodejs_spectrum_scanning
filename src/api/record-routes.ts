import { Router } from 'express';

import { createSignalRecordController } from './record-controller';

export const createSignalRecordRouter = (): Router => {
  const controller = createSignalRecordController();
  const router = Router();

  router.post('/records', controller.create);
  router.get('/records', controller.findAll);
  router.get('/records/:uuid', controller.findOne);

  return router;
};
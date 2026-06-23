import { Router } from 'express';
import multer from 'multer';

import { createSignalRecordController } from './record-controller';

export const createSignalRecordRouter = (): Router => {
  const controller = createSignalRecordController();
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 256 * 1024 * 1024
    }
  });

  router.post('/records', upload.single('iqFile'), controller.create);
  router.get('/records', controller.findAll);
  router.get('/records/:uuid', controller.findOne);
  router.get('/records/:uuid/iq-file', controller.downloadIqFile);
  router.get('/records/:uuid/sigmf-data', controller.downloadSigmfData);
  router.get('/records/:uuid/sigmf-meta', controller.downloadSigmfMeta);
  router.get('/records/:uuid/sigmf', controller.downloadSigmfArchive);

  return router;
};
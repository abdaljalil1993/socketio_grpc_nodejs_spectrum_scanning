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

  router.post(
    '/records',
    upload.fields([
      { name: 'iqFile', maxCount: 1 },
      { name: 'spectrumImage', maxCount: 1 },
      { name: 'waterfallImage', maxCount: 1 }
    ]),
    controller.create,
  );
  router.get('/records', controller.findAll);
  router.get('/records/:uuid', controller.findOne);
  router.get('/records/:uuid/iq-file', controller.downloadIqFile);
  router.get('/records/:uuid/sigmf-data', controller.downloadSigmfData);
  router.get('/records/:uuid/sigmf-meta', controller.downloadSigmfMeta);
  router.get('/records/:uuid/sigmf', controller.downloadSigmfArchive);
  router.get('/records/:uuid/spectrum-image', controller.downloadSpectrumImage);
  router.get('/records/:uuid/waterfall-image', controller.downloadWaterfallImage);

  return router;
};
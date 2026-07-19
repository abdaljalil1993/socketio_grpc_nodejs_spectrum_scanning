import { randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';
import { z } from 'zod';

import type { SignalRecord } from '../database/entities/signal-record.entity';
import { createSignalRecordService } from '../database/services/signal-record.service';
import { createSignalRecordFileStorage } from '../storage/signal-record-file-storage';
import { createSigmfMetadata } from '../storage/signal-record-sigmf';

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const optionalRecord = z.preprocess((value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}, z.record(z.string(), z.unknown()).optional());

const createSignalRecordSchema = z.object({
  uuid: z.string().uuid().optional(),
  iqFile: z.string().min(1).optional(),
  sampleRate: z.coerce.number().finite().optional(),
  dataType: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  collection: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  hardware: z.string().min(1).optional(),
  numChannels: z.coerce.number().int().optional(),
  offset: z.coerce.number().finite().optional(),
  recorder: z.string().min(1).optional(),
  trailingBytes: z.coerce.number().int().optional(),
  location: z.string().min(1).optional(),
  timeDate: z.coerce.date().optional(),
  receiverGain: z.coerce.number().finite().optional(),
  antennaType: z.string().min(1).optional(),
  antennaLowFrequency: z.coerce.number().finite().optional(),
  antennaHighFrequency: z.coerce.number().finite().optional(),
  antennaGain: z.coerce.number().finite().optional(),
  antennaHorizontalBeamWidth: z.coerce.number().finite().optional(),
  antennaVerticalBeamWidth: z.coerce.number().finite().optional(),
  antennaSteerable: optionalBoolean,
  antennaMobile: optionalBoolean,
  antennaHagl: z.coerce.number().finite().optional(),
  threatScore: z.coerce.number().finite().optional(),
  riskReason: z.string().min(1).optional(),
  repeat: z.coerce.number().int().optional(),
  firstSeen: z.coerce.date().optional(),
  lastSeen: z.coerce.date().optional(),
  patternType: z.string().min(1).optional(),
  spectrumImage: z.string().min(1).optional(),
  waterfallImage: z.string().min(1).optional(),
  extensions: optionalRecord,
  notes: z.string().min(1).optional()
});

const uuidParamSchema = z.object({
  uuid: z.string().uuid()
});

type SignalRecordWithFile = SignalRecord & {
  iqFile: string;
};

type UploadedRecordFiles = Partial<Record<'iqFile' | 'spectrumImage' | 'waterfallImage', Express.Multer.File[]>>;

const getUploadedRecordFiles = (request: Request): UploadedRecordFiles => {
  if (!request.files || Array.isArray(request.files)) {
    return {};
  }

  return request.files as UploadedRecordFiles;
};

const isImageUpload = (file: Express.Multer.File | undefined): boolean =>
  Boolean(file && file.mimetype.toLowerCase().startsWith('image/'));

const loadRecordWithSigmf = async (uuid: string) => {
  const service = createSignalRecordService();
  const fileStorage = createSignalRecordFileStorage();
  const record = await service.findByUuid(uuid);

  if (!record || !record.iqFile) {
    return {
      status: 404,
      message: `IQ file not found for uuid ${uuid}`
    } as const;
  }

  if (!(await fileStorage.exists(record.iqFile))) {
    return {
      status: 404,
      message: `Stored SigMF recording not found for uuid ${uuid}`
    } as const;
  }

  return {
    record: record as SignalRecordWithFile,
    fileStorage
  } as const;
};

const loadRecordWithImage = async (uuid: string, imageType: 'spectrum' | 'waterfall') => {
  const service = createSignalRecordService();
  const fileStorage = createSignalRecordFileStorage();
  const record = await service.findByUuid(uuid);

  if (!record) {
    return {
      status: 404,
      message: `Signal record not found for uuid ${uuid}`
    } as const;
  }

  const imageFileName = imageType === 'spectrum' ? record.spectrumImage : record.waterfallImage;

  if (!imageFileName) {
    return {
      status: 404,
      message: `${imageType} image not found for uuid ${uuid}`
    } as const;
  }

  if (!(await fileStorage.imageExists(imageFileName))) {
    return {
      status: 404,
      message: `Stored ${imageType} image not found for uuid ${uuid}`
    } as const;
  }

  return {
    fileStorage,
    imageFileName
  } as const;
};

export const createSignalRecordController = () => {
  const service = createSignalRecordService();
  const fileStorage = createSignalRecordFileStorage();

  return {
    async create(request: Request, response: Response): Promise<void> {
      const payload = createSignalRecordSchema.parse(request.body ?? {});
      const uuid = payload.uuid ?? randomUUID();
      const files = getUploadedRecordFiles(request);
      const iqFile = files.iqFile?.[0];
      const spectrumImageFile = files.spectrumImage?.[0];
      const waterfallImageFile = files.waterfallImage?.[0];

      if (spectrumImageFile && !isImageUpload(spectrumImageFile)) {
        response.status(400).json({ message: 'spectrumImage must be a valid image file' });
        return;
      }

      if (waterfallImageFile && !isImageUpload(waterfallImageFile)) {
        response.status(400).json({ message: 'waterfallImage must be a valid image file' });
        return;
      }

      const uploadedFileName = iqFile ? fileStorage.createDataFileName(uuid, iqFile.originalname) : payload.iqFile;
      const uploadedSpectrumImageFileName = spectrumImageFile
        ? fileStorage.createImageFileName(uuid, 'spectrum', spectrumImageFile.originalname)
        : payload.spectrumImage;
      const uploadedWaterfallImageFileName = waterfallImageFile
        ? fileStorage.createImageFileName(uuid, 'waterfall', waterfallImageFile.originalname)
        : payload.waterfallImage;

      const record = await service.create({
        ...payload,
        uuid,
        iqFile: uploadedFileName,
        spectrumImage: uploadedSpectrumImageFileName,
        waterfallImage: uploadedWaterfallImageFileName
      });

      try {
        if (iqFile) {
          const dataFileName = uploadedFileName ?? fileStorage.createDataFileName(uuid, iqFile.originalname);
          const metadataContent = createSigmfMetadata(record, dataFileName, iqFile.buffer);
          await fileStorage.save(dataFileName, iqFile.buffer, metadataContent);
        }

        if (spectrumImageFile && uploadedSpectrumImageFileName) {
          await fileStorage.saveImage(uploadedSpectrumImageFileName, spectrumImageFile.buffer);
        }

        if (waterfallImageFile && uploadedWaterfallImageFileName) {
          await fileStorage.saveImage(uploadedWaterfallImageFileName, waterfallImageFile.buffer);
        }
      } catch (error) {
        await service.deleteByUuid(record.uuid);

        if (iqFile && uploadedFileName) {
          await fileStorage.remove(uploadedFileName);
        }

        if (spectrumImageFile && uploadedSpectrumImageFileName) {
          await fileStorage.removeImage(uploadedSpectrumImageFileName);
        }

        if (waterfallImageFile && uploadedWaterfallImageFileName) {
          await fileStorage.removeImage(uploadedWaterfallImageFileName);
        }

        throw error;
      }

      response.status(201).json({
        record,
        iqFileDownloadUrl: uploadedFileName ? `/records/${record.uuid}/iq-file` : null,
        sigmfDataDownloadUrl: uploadedFileName ? `/records/${record.uuid}/sigmf-data` : null,
        sigmfMetaDownloadUrl: uploadedFileName ? `/records/${record.uuid}/sigmf-meta` : null,
        sigmfArchiveDownloadUrl: uploadedFileName ? `/records/${record.uuid}/sigmf` : null,
        spectrumImageDownloadUrl: spectrumImageFile ? `/records/${record.uuid}/spectrum-image` : null,
        waterfallImageDownloadUrl: waterfallImageFile ? `/records/${record.uuid}/waterfall-image` : null
      });
    },
    async findAll(_request: Request, response: Response): Promise<void> {
      const records = await service.findAll();

      response.json({ records });
    },
    async findOne(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const record = await service.findByUuid(uuid);

      if (!record) {
        response.status(404).json({ message: `Signal record not found for uuid ${uuid}` });
        return;
      }

      response.json({ record });
    },
    async downloadIqFile(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithSigmf(uuid);

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      response.type('application/octet-stream');
      response.download(result.fileStorage.resolveDataFilePath(result.record.iqFile), result.record.iqFile);
    },
    async downloadSigmfData(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithSigmf(uuid);

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      response.type('application/octet-stream');
      response.download(result.fileStorage.resolveDataFilePath(result.record.iqFile), result.record.iqFile);
    },
    async downloadSigmfMeta(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithSigmf(uuid);

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      const metaFileName = result.fileStorage.resolveMetaFilePath(result.record.iqFile);
      response.type('application/json');
      response.download(metaFileName);
    },
    async downloadSigmfArchive(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithSigmf(uuid);

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      response.setHeader('Content-Type', 'application/zip');
      response.setHeader('Content-Disposition', `attachment; filename="${result.fileStorage.resolveArchiveFileName(result.record.iqFile)}"`);

      const archiveStream = result.fileStorage.createArchiveStream(result.record.iqFile);
      archiveStream.on('error', (error: Error) => {
        response.destroy(error instanceof Error ? error : new Error('Failed to create SigMF ZIP archive stream'));
      });
      archiveStream.pipe(response);
    },
    async downloadSpectrumImage(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithImage(uuid, 'spectrum');

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      response.sendFile(result.fileStorage.resolveImageFilePath(result.imageFileName));
    },
    async downloadWaterfallImage(request: Request, response: Response): Promise<void> {
      const { uuid } = uuidParamSchema.parse(request.params);
      const result = await loadRecordWithImage(uuid, 'waterfall');

      if ('status' in result) {
        response.status(result.status).json({ message: result.message });
        return;
      }

      response.sendFile(result.fileStorage.resolveImageFilePath(result.imageFileName));
    }
  };
};
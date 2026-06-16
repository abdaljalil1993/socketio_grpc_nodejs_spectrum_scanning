import type { Request, Response } from 'express';
import { z } from 'zod';

import { createSignalRecordService } from '../database/services/signal-record.service';

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
  extensions: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().min(1).optional()
});

const uuidParamSchema = z.object({
  uuid: z.string().uuid()
});

export const createSignalRecordController = () => {
  const service = createSignalRecordService();

  return {
    async create(request: Request, response: Response): Promise<void> {
      const payload = createSignalRecordSchema.parse(request.body ?? {});
      const record = await service.create(payload);

      response.status(201).json({ record });
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
    }
  };
};
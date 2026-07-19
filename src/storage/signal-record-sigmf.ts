import { createHash } from 'node:crypto';
import path from 'node:path';

import type { SignalRecord } from '../database/entities/signal-record.entity';

const SIGMF_VERSION = '1.2.6';
const APP_EXTENSION_VERSION = '1.0.0';
const ANTENNA_EXTENSION_VERSION = '1.0.0';

const SIGMF_DATA_TYPE_PATTERN = /^(?:[cr](?:f32|f64|i32|i16|u32|u16)_(?:le|be)|[cr](?:i8|u8))$/;

const DATA_TYPE_ALIASES: Record<string, string> = {
  complex64: 'cf32_le',
  complex128: 'cf64_le',
  float32: 'rf32_le',
  float64: 'rf64_le',
  int32: 'ri32_le',
  int16: 'ri16_le',
  uint32: 'ru32_le',
  uint16: 'ru16_le',
  int8: 'ri8',
  uint8: 'ru8'
};

const toIsoString = (value: Date | null): string | undefined => value?.toISOString();

const toInteger = (value: number | null): number | undefined => {
  if (value === null || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.trunc(value);
};

const withDefinedValues = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)) as T;

const normalizeDataType = (dataType: string | null): string => {
  if (!dataType) {
    return 'cf32_le';
  }

  const normalizedValue = dataType.trim().toLowerCase();

  if (SIGMF_DATA_TYPE_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }

  return DATA_TYPE_ALIASES[normalizedValue] ?? 'cf32_le';
};

const hasAntennaMetadata = (record: SignalRecord): boolean =>
  [
    record.antennaType,
    record.antennaLowFrequency,
    record.antennaHighFrequency,
    record.antennaGain,
    record.antennaHorizontalBeamWidth,
    record.antennaVerticalBeamWidth,
    record.antennaSteerable,
    record.antennaMobile,
    record.antennaHagl
  ].some((value) => value !== null && value !== undefined);

export const createSigmfMetadata = (record: SignalRecord, dataFileName: string, dataFileBuffer: Buffer): string => {
  const extensionDefinitions = [
    {
      name: 'app',
      version: APP_EXTENSION_VERSION,
      optional: true
    }
  ];

  if (hasAntennaMetadata(record)) {
    extensionDefinitions.push({
      name: 'antenna',
      version: ANTENNA_EXTENSION_VERSION,
      optional: true
    });
  }

  const globalObject = withDefinedValues({
    'core:datatype': normalizeDataType(record.dataType),
    'core:sample_rate': record.sampleRate ?? undefined,
    'core:version': SIGMF_VERSION,
    'core:author': record.author ?? undefined,
    'core:collection': record.collection ?? undefined,
    'core:description': record.description ?? undefined,
    'core:hw': record.hardware ?? undefined,
    'core:num_channels': toInteger(record.numChannels),
    'core:offset': toInteger(record.offset),
    'core:recorder': record.recorder ?? undefined,
    'core:sha512': createHash('sha512').update(dataFileBuffer).digest('hex'),
    'core:trailing_bytes': toInteger(record.trailingBytes),
    'core:extensions': extensionDefinitions,
    'antenna:type': record.antennaType ?? undefined,
    'antenna:low_frequency': record.antennaLowFrequency ?? undefined,
    'antenna:high_frequency': record.antennaHighFrequency ?? undefined,
    'antenna:gain': record.antennaGain ?? undefined,
    'antenna:horizontal_beam_width': record.antennaHorizontalBeamWidth ?? undefined,
    'antenna:vertical_beam_width': record.antennaVerticalBeamWidth ?? undefined,
    'antenna:steerable': record.antennaSteerable ?? undefined,
    'antenna:mobile': record.antennaMobile ?? undefined,
    'antenna:hagl': record.antennaHagl ?? undefined,
    'app:record_uuid': record.uuid,
    'app:data_file': dataFileName,
    'app:location': record.location ?? undefined,
    'app:receiver_gain_db': record.receiverGain ?? undefined,
    'app:threat_score': record.threatScore ?? undefined,
    'app:risk_reason': record.riskReason ?? undefined,
    'app:repeat_count': toInteger(record.repeat),
    'app:pattern_type': record.patternType ?? undefined,
    'app:spectrum_image': record.spectrumImage ?? undefined,
    'app:waterfall_image': record.waterfallImage ?? undefined,
    'app:notes': record.notes ?? undefined,
    'app:user_extensions': record.extensions ?? undefined
  });

  const captureObject = withDefinedValues({
    'core:sample_start': 0,
    'core:datetime': toIsoString(record.timeDate)
  });

  const annotations = [
    withDefinedValues({
      'core:sample_start': 0,
      'core:label': record.patternType ?? undefined,
      'core:comment': record.riskReason ?? record.notes ?? undefined,
      'core:generator': record.recorder ?? 'records-api',
      'core:uuid': record.uuid,
      'app:first_seen': toIsoString(record.firstSeen),
      'app:last_seen': toIsoString(record.lastSeen)
    })
  ].filter((annotation) => Object.keys(annotation).length > 1);

  const metadata = {
    global: globalObject,
    captures: [captureObject],
    annotations
  };

  return `${JSON.stringify(metadata, null, 2)}\n`;
};

export const getSigmfMetaFileName = (dataFileName: string): string => {
  const parsedFileName = path.parse(dataFileName);
  return `${parsedFileName.name}.sigmf-meta`;
};
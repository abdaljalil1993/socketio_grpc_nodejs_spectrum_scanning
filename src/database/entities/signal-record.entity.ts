import { EntitySchema } from 'typeorm';

export interface SignalRecord {
  uuid: string;
  iqFile: string | null;
  sampleRate: number | null;
  dataType: string | null;
  author: string | null;
  collection: string | null;
  description: string | null;
  hardware: string | null;
  numChannels: number | null;
  offset: number | null;
  recorder: string | null;
  trailingBytes: number | null;
  location: string | null;
  timeDate: Date | null;
  receiverGain: number | null;
  antennaType: string | null;
  antennaLowFrequency: number | null;
  antennaHighFrequency: number | null;
  antennaGain: number | null;
  antennaHorizontalBeamWidth: number | null;
  antennaVerticalBeamWidth: number | null;
  antennaSteerable: boolean | null;
  antennaMobile: boolean | null;
  antennaHagl: number | null;
  threatScore: number | null;
  riskReason: string | null;
  repeat: number | null;
  firstSeen: Date | null;
  lastSeen: Date | null;
  patternType: string | null;
  spectrumImage: string | null;
  extensions: Record<string, unknown> | null;
  notes: string | null;
}

export const signalRecordEntity = new EntitySchema<SignalRecord>({
  name: 'SignalRecord',
  tableName: 'signal_records',
  columns: {
    uuid: {
      type: 'varchar',
      length: 36,
      primary: true,
      generated: 'uuid'
    },
    iqFile: {
      name: 'iq_file',
      type: 'varchar',
      length: 255,
      nullable: true
    },
    sampleRate: {
      name: 'sample_rate',
      type: 'double',
      nullable: true
    },
    dataType: {
      name: 'data_type',
      type: 'varchar',
      length: 100,
      nullable: true
    },
    author: {
      type: 'varchar',
      length: 255,
      nullable: true
    },
    collection: {
      name: 'collection_name',
      type: 'varchar',
      length: 255,
      nullable: true
    },
    description: {
      type: 'text',
      nullable: true
    },
    hardware: {
      type: 'varchar',
      length: 255,
      nullable: true
    },
    numChannels: {
      name: 'num_channels',
      type: 'int',
      nullable: true
    },
    offset: {
      name: 'file_offset',
      type: 'double',
      nullable: true
    },
    recorder: {
      type: 'varchar',
      length: 255,
      nullable: true
    },
    trailingBytes: {
      name: 'trailing_bytes',
      type: 'int',
      nullable: true
    },
    location: {
      type: 'varchar',
      length: 255,
      nullable: true
    },
    timeDate: {
      name: 'time_date',
      type: 'datetime',
      nullable: true
    },
    receiverGain: {
      name: 'receiver_gain',
      type: 'double',
      nullable: true
    },
    antennaType: {
      name: 'antenna_type',
      type: 'varchar',
      length: 255,
      nullable: true
    },
    antennaLowFrequency: {
      name: 'antenna_low_frequency',
      type: 'double',
      nullable: true
    },
    antennaHighFrequency: {
      name: 'antenna_high_frequency',
      type: 'double',
      nullable: true
    },
    antennaGain: {
      name: 'antenna_gain',
      type: 'double',
      nullable: true
    },
    antennaHorizontalBeamWidth: {
      name: 'antenna_horizontal_beam_width',
      type: 'double',
      nullable: true
    },
    antennaVerticalBeamWidth: {
      name: 'antenna_vertical_beam_width',
      type: 'double',
      nullable: true
    },
    antennaSteerable: {
      name: 'antenna_steerable',
      type: 'boolean',
      nullable: true
    },
    antennaMobile: {
      name: 'antenna_mobile',
      type: 'boolean',
      nullable: true
    },
    antennaHagl: {
      name: 'antenna_hagl',
      type: 'double',
      nullable: true
    },
    threatScore: {
      name: 'threat_score',
      type: 'double',
      nullable: true
    },
    riskReason: {
      name: 'risk_reason',
      type: 'text',
      nullable: true
    },
    repeat: {
      name: 'repeat_count',
      type: 'int',
      nullable: true
    },
    firstSeen: {
      name: 'first_seen',
      type: 'datetime',
      nullable: true
    },
    lastSeen: {
      name: 'last_seen',
      type: 'datetime',
      nullable: true
    },
    patternType: {
      name: 'pattern_type',
      type: 'varchar',
      length: 255,
      nullable: true
    },
    spectrumImage: {
      name: 'spectrum_image',
      type: 'text',
      nullable: true
    },
    extensions: {
      type: 'json',
      nullable: true
    },
    notes: {
      type: 'text',
      nullable: true
    }
  }
});
import { AppDataSource } from '../data-source';
import { signalRecordEntity } from '../entities/signal-record.entity';
import type { SignalRecord } from '../entities/signal-record.entity';
import type { DeepPartial } from 'typeorm';

type OptionalCreateFields = {
  [Key in keyof Omit<SignalRecord, 'uuid'>]?: SignalRecord[Key] | undefined;
};

export type CreateSignalRecordInput = OptionalCreateFields & {
  uuid?: string | undefined;
};

const getRepository = () => AppDataSource.getRepository(signalRecordEntity);

const toDefinedFields = (input: CreateSignalRecordInput): DeepPartial<SignalRecord> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as DeepPartial<SignalRecord>;

export const createSignalRecordService = () => ({
  async create(input: CreateSignalRecordInput): Promise<SignalRecord> {
    const repository = getRepository();
    const record = repository.create(toDefinedFields(input));

    return repository.save(record);
  },
  async findAll(): Promise<SignalRecord[]> {
    return getRepository().find({
      order: {
        timeDate: 'DESC',
        firstSeen: 'DESC',
        lastSeen: 'DESC'
      }
    });
  },
  async findByUuid(uuid: string): Promise<SignalRecord | null> {
    return getRepository().findOneBy({ uuid });
  }
});
import type { Logger } from 'pino';
import { DataSource } from 'typeorm';

import { env } from '../config/env';
import { signalRecordEntity } from './entities/signal-record.entity';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  entities: [signalRecordEntity],
  synchronize: env.DB_SYNCHRONIZE,
  logging: env.DB_LOGGING
});

export const initializeDataSource = async (logger: Logger): Promise<DataSource> => {
  if (AppDataSource.isInitialized) {
    return AppDataSource;
  }

  const dataSource = await AppDataSource.initialize();

  logger.info(
    {
      database: env.DB_NAME,
      host: env.DB_HOST,
      port: env.DB_PORT,
      synchronize: env.DB_SYNCHRONIZE
    },
    'MySQL datasource initialized',
  );

  return dataSource;
};
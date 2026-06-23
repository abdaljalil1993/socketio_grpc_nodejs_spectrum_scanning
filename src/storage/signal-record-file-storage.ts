import fs from 'node:fs/promises';
import path from 'node:path';
import * as archiver from 'archiver';

import { env } from '../config/env';

import { getSigmfMetaFileName } from './signal-record-sigmf';

const sanitizeBaseName = (fileName: string): string => {
  const parsedFileName = path.parse(path.basename(fileName).trim());
  const normalizedBaseName = parsedFileName.name
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedBaseName || 'recording';
};

const createUniqueBaseName = (uuid: string, fileName: string): string => {
  const sanitizedBaseName = sanitizeBaseName(fileName);
  return `${sanitizedBaseName}-${uuid}`;
};

const getFilePath = (fileName: string): string => path.join(env.RECORDS_STORAGE_DIR, fileName);

const getArchiveFileName = (dataFileName: string): string => `${path.parse(dataFileName).name}.sigmf.zip`;

const getDataFileName = (uuid: string, fileName: string): string => `${createUniqueBaseName(uuid, fileName)}.sigmf-data`;

export const createSignalRecordFileStorage = () => ({
  createDataFileName(uuid: string, fileName: string): string {
    return getDataFileName(uuid, fileName);
  },
  resolveDataFilePath(fileName: string): string {
    return getFilePath(fileName);
  },
  resolveMetaFilePath(dataFileName: string): string {
    return getFilePath(getSigmfMetaFileName(dataFileName));
  },
  resolveArchiveFileName(dataFileName: string): string {
    return getArchiveFileName(dataFileName);
  },
  async exists(dataFileName: string): Promise<boolean> {
    try {
      await Promise.all([fs.access(getFilePath(dataFileName)), fs.access(getFilePath(getSigmfMetaFileName(dataFileName)))]);
      return true;
    } catch {
      return false;
    }
  },
  async save(dataFileName: string, fileBuffer: Buffer, metadataContent: string): Promise<void> {
    await fs.mkdir(env.RECORDS_STORAGE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(getFilePath(dataFileName), fileBuffer),
      fs.writeFile(getFilePath(getSigmfMetaFileName(dataFileName)), metadataContent, 'utf8')
    ]);
  },
  async remove(dataFileName: string): Promise<void> {
    await Promise.all([
      fs.rm(getFilePath(dataFileName), { force: true }),
      fs.rm(getFilePath(getSigmfMetaFileName(dataFileName)), { force: true })
    ]);
  },
  createArchiveStream(dataFileName: string) {
    const archive = new archiver.ZipArchive({
      zlib: {
        level: 9
      }
    });

    archive.file(getFilePath(dataFileName), { name: dataFileName });
    archive.file(getFilePath(getSigmfMetaFileName(dataFileName)), { name: getSigmfMetaFileName(dataFileName) });
    void archive.finalize();

    return archive;
  }
});
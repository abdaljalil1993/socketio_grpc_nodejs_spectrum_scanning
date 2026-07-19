import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
const getImageDirectoryPath = (): string => path.join(env.RECORDS_STORAGE_DIR, 'images');
const getImageFilePath = (fileName: string): string => path.join(getImageDirectoryPath(), fileName);

const getArchiveFileName = (dataFileName: string): string => `${path.parse(dataFileName).name}.sigmf.zip`;

const getDataFileName = (uuid: string, fileName: string): string => `${createUniqueBaseName(uuid, fileName)}.sigmf-data`;

const normalizeImageExtension = (fileName: string): string => {
  const extension = path.extname(fileName).toLowerCase();
  const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.svg']);

  if (allowedExtensions.has(extension)) {
    return extension;
  }

  return '.png';
};

const getImageFileName = (uuid: string, imageType: 'spectrum' | 'waterfall', fileName: string): string => {
  const uniqueBaseName = createUniqueBaseName(uuid, fileName);
  const extension = normalizeImageExtension(fileName);

  return `${imageType}-${uniqueBaseName}-${randomUUID()}${extension}`;
};

export const createSignalRecordFileStorage = () => ({
  createDataFileName(uuid: string, fileName: string): string {
    return getDataFileName(uuid, fileName);
  },
  createImageFileName(uuid: string, imageType: 'spectrum' | 'waterfall', fileName: string): string {
    return getImageFileName(uuid, imageType, fileName);
  },
  resolveDataFilePath(fileName: string): string {
    return getFilePath(fileName);
  },
  resolveImageFilePath(fileName: string): string {
    return getImageFilePath(fileName);
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
  async saveImage(fileName: string, fileBuffer: Buffer): Promise<void> {
    await fs.mkdir(getImageDirectoryPath(), { recursive: true });
    await fs.writeFile(getImageFilePath(fileName), fileBuffer);
  },
  async imageExists(fileName: string): Promise<boolean> {
    try {
      await fs.access(getImageFilePath(fileName));
      return true;
    } catch {
      return false;
    }
  },
  async remove(dataFileName: string): Promise<void> {
    await Promise.all([
      fs.rm(getFilePath(dataFileName), { force: true }),
      fs.rm(getFilePath(getSigmfMetaFileName(dataFileName)), { force: true })
    ]);
  },
  async removeImage(fileName: string): Promise<void> {
    await fs.rm(getImageFilePath(fileName), { force: true });
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
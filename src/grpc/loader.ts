import fs from 'node:fs';
import path from 'node:path';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const isProtoFile = (entryPath: string): boolean => entryPath.endsWith('.proto');

const walkDirectory = (directoryPath: string): string[] => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return walkDirectory(absolutePath);
    }

    return isProtoFile(absolutePath) ? [absolutePath] : [];
  });
};

export const collectProtoFiles = (protoDirectory: string): string[] => {
  if (!fs.existsSync(protoDirectory)) {
    throw new Error(`Proto directory not found: ${protoDirectory}`);
  }

  const protoFiles = walkDirectory(protoDirectory).sort();

  if (protoFiles.length === 0) {
    throw new Error(`No .proto files were found under ${protoDirectory}`);
  }

  return protoFiles;
};

export const loadGrpcObject = (protoFiles: string[], protoDirectory: string): grpc.GrpcObject => {
  const packageDefinition = protoLoader.loadSync(protoFiles, {
    keepCase: false,
    longs: String,
    bytes: String,
    enums: String,
    defaults: false,
    arrays: true,
    objects: true,
    oneofs: true,
    includeDirs: [protoDirectory, path.resolve(protoDirectory, '..')]
  });

  return grpc.loadPackageDefinition(packageDefinition);
};
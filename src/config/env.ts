import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const numberFromEnv = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return defaultValue;
      }

      return value.toLowerCase() === 'true';
    });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: numberFromEnv(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GRPC_TARGET: z.string().min(1, 'GRPC_TARGET is required'),
  GRPC_USE_TLS: booleanFromEnv(false),
  GRPC_CONNECT_TIMEOUT_MS: numberFromEnv(5000),
  GRPC_REQUEST_TIMEOUT_MS: numberFromEnv(15000),
  GRPC_PROTO_DIR: z.string().default('src/proto'),
  SOCKET_PATH: z.string().default('/socket.io'),
  CORS_ORIGIN: z.string().default('*'),
  GRPC_STREAM_SUBSCRIPTIONS: z.string().default('[]')
});

const parsedEnv = baseEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

const streamSubscriptionSchema = z.object({
  service: z.string().min(1),
  method: z.string().min(1),
  payload: z.unknown().optional().default({})
});

let rawSubscriptions: unknown;

try {
  rawSubscriptions = JSON.parse(parsedEnv.data.GRPC_STREAM_SUBSCRIPTIONS);
} catch (error) {
  throw new Error(`Invalid GRPC_STREAM_SUBSCRIPTIONS JSON: ${(error as Error).message}`);
}

const parsedSubscriptions = z.array(streamSubscriptionSchema).safeParse(rawSubscriptions);

if (!parsedSubscriptions.success) {
  throw new Error(`Invalid GRPC_STREAM_SUBSCRIPTIONS value: ${parsedSubscriptions.error.message}`);
}

const normalizedCorsOrigin =
  parsedEnv.data.CORS_ORIGIN === '*'
    ? true
    : parsedEnv.data.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

export const env = {
  ...parsedEnv.data,
  GRPC_PROTO_DIR: path.resolve(process.cwd(), parsedEnv.data.GRPC_PROTO_DIR),
  corsOrigin: normalizedCorsOrigin,
  grpcStreamSubscriptions: parsedSubscriptions.data
};

export type StreamSubscriptionConfig = (typeof env.grpcStreamSubscriptions)[number];
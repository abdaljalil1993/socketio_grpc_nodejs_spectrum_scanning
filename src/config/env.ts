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
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: numberFromEnv(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('new_spec_backend'),
  DB_SYNCHRONIZE: booleanFromEnv(true),
  DB_LOGGING: booleanFromEnv(false),
  GRPC_TARGET: z.string().min(1, 'GRPC_TARGET is required'),
  GRPC_SERVICE_TARGETS: z.string().default('{}'),
  GRPC_METHOD_TIMEOUTS: z.string().default('{}'),
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

const serviceTargetsSchema = z.record(z.string().min(1), z.string().min(1));
const methodTimeoutsSchema = z.record(z.string().min(1), z.number().int().positive());

let rawSubscriptions: unknown;
let rawServiceTargets: unknown;
let rawMethodTimeouts: unknown;

try {
  rawSubscriptions = JSON.parse(parsedEnv.data.GRPC_STREAM_SUBSCRIPTIONS);
} catch (error) {
  throw new Error(`Invalid GRPC_STREAM_SUBSCRIPTIONS JSON: ${(error as Error).message}`);
}

try {
  rawServiceTargets = JSON.parse(parsedEnv.data.GRPC_SERVICE_TARGETS);
} catch (error) {
  throw new Error(`Invalid GRPC_SERVICE_TARGETS JSON: ${(error as Error).message}`);
}

try {
  rawMethodTimeouts = JSON.parse(parsedEnv.data.GRPC_METHOD_TIMEOUTS);
} catch (error) {
  throw new Error(`Invalid GRPC_METHOD_TIMEOUTS JSON: ${(error as Error).message}`);
}

const parsedSubscriptions = z.array(streamSubscriptionSchema).safeParse(rawSubscriptions);
const parsedServiceTargets = serviceTargetsSchema.safeParse(rawServiceTargets);
const parsedMethodTimeouts = methodTimeoutsSchema.safeParse(rawMethodTimeouts);

if (!parsedSubscriptions.success) {
  throw new Error(`Invalid GRPC_STREAM_SUBSCRIPTIONS value: ${parsedSubscriptions.error.message}`);
}

if (!parsedServiceTargets.success) {
  throw new Error(`Invalid GRPC_SERVICE_TARGETS value: ${parsedServiceTargets.error.message}`);
}

if (!parsedMethodTimeouts.success) {
  throw new Error(`Invalid GRPC_METHOD_TIMEOUTS value: ${parsedMethodTimeouts.error.message}`);
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
  grpcMethodTimeouts: parsedMethodTimeouts.data,
  grpcServiceTargets: parsedServiceTargets.data,
  grpcStreamSubscriptions: parsedSubscriptions.data
};

export type StreamSubscriptionConfig = (typeof env.grpcStreamSubscriptions)[number];
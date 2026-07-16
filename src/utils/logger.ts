import pino from 'pino';

import { env } from '../config/env';

const effectiveLogLevel =
  env.NODE_ENV === 'production' && env.LOG_ONLY_ERRORS_IN_PRODUCTION ? 'error' : env.LOG_LEVEL;

export const logger = pino({
  name: 'grpc-socket-gateway',
  level: effectiveLogLevel,
  base: {
    service: 'grpc-socket-gateway'
  },
  redact: ['req.headers.authorization'],
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard'
          }
        }
      }
    : {})
});
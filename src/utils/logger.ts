import pino from 'pino';

import { env } from '../config/env';

export const logger = pino({
  name: 'grpc-socket-gateway',
  level: env.LOG_LEVEL,
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
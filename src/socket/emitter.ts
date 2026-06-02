import type { Server } from 'socket.io';

import type { Logger } from 'pino';

export interface SocketEmitOptions {
  room?: string;
}

export interface SocketEmitter {
  attach(io: Server): void;
  emit(eventName: string, payload: unknown, options?: SocketEmitOptions): void;
}

export const createSocketEmitter = (logger: Logger): SocketEmitter => {
  let io: Server | null = null;

  return {
    attach(server) {
      io = server;
    },
    emit(eventName, payload, options) {
      if (!io) {
        logger.warn({ eventName }, 'Socket emitter not attached yet');
        return;
      }

      if (options?.room) {
        io.to(options.room).emit(eventName, payload);
        logger.info({ eventName, room: options.room }, 'Socket event emitted to room');
        return;
      }

      io.emit(eventName, payload);
      logger.info({ eventName }, 'Socket event emitted');
    }
  };
};
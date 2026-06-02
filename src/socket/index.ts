import type { Server as HttpServer } from 'node:http';

import type { Logger } from 'pino';
import { Server } from 'socket.io';

import { env } from '../config/env';
import { GatewayError } from '../grpc/handlers';
import type { GrpcGateway } from '../grpc/handlers';

interface SocketInvokeRequest {
  service: string;
  method: string;
  payload?: unknown;
  requestId?: string | undefined;
}

interface SocketMethodInvokeRequest {
  payload?: unknown;
  requestId?: string | undefined;
}

const SOCKET_INVOKE_EVENT = 'grpc:invoke';
const SOCKET_RESULT_EVENT = 'grpc:result';
const SOCKET_ERROR_EVENT = 'grpc:error';
const SOCKET_METHODS_EVENT = 'grpc:methods';

const buildMethodInvokeEventName = (serviceName: string, methodName: string): string =>
  `grpc:invoke:${serviceName}.${methodName}`;

const normalizeMethodInvokeRequest = (message: unknown): SocketMethodInvokeRequest => {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { payload: message };
  }

  const candidate = message as Record<string, unknown>;

  if ('payload' in candidate || 'requestId' in candidate) {
    return {
      payload: candidate.payload,
      requestId: typeof candidate.requestId === 'string' ? candidate.requestId : undefined
    };
  }

  return { payload: candidate };
};

export const createSocketServer = (httpServer: HttpServer, gateway: GrpcGateway, logger: Logger): Server => {
  const io = new Server(httpServer, {
    path: env.SOCKET_PATH,
    serveClient: false,
    perMessageDeflate: false,
    httpCompression: false,
    cors: {
      origin: env.corsOrigin,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Socket client connected');

    const methods = gateway.getServices().flatMap((service) =>
      service.methods.map((method) => ({
        serviceName: service.serviceName,
        methodName: method.methodName,
        requestEvent: buildMethodInvokeEventName(service.serviceName, method.methodName),
        responseEvent: method.eventName,
        responseStream: method.responseStream
      })),
    );

    const handleInvoke = async ({ service, method, payload, requestId }: SocketInvokeRequest, triggerEvent: string) => {
      try {
        const result = await gateway.invoke(service, method, payload ?? {}, { targetRoom: socket.id });

        socket.emit(SOCKET_RESULT_EVENT, {
          requestId,
          triggerEvent,
          service,
          method,
          result
        });
      } catch (error) {
        const statusCode = error instanceof GatewayError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : 'Unknown socket invocation error';

        logger.warn(
          { socketId: socket.id, triggerEvent, service, method, requestId, error },
          'Socket gRPC invocation failed',
        );

        socket.emit(SOCKET_ERROR_EVENT, {
          requestId,
          triggerEvent,
          service,
          method,
          statusCode,
          message
        });
      }
    };

    socket.emit(SOCKET_METHODS_EVENT, { methods });

    socket.on(SOCKET_INVOKE_EVENT, async (message: unknown) => {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        socket.emit(SOCKET_ERROR_EVENT, {
          triggerEvent: SOCKET_INVOKE_EVENT,
          statusCode: 400,
          message: 'Socket invoke payload must be an object with service and method'
        });
        return;
      }

      const request = message as Partial<SocketInvokeRequest>;

      if (typeof request.service !== 'string' || typeof request.method !== 'string') {
        socket.emit(SOCKET_ERROR_EVENT, {
          requestId: typeof request.requestId === 'string' ? request.requestId : undefined,
          triggerEvent: SOCKET_INVOKE_EVENT,
          statusCode: 400,
          message: 'Socket invoke payload requires string service and method fields'
        });
        return;
      }

      await handleInvoke(
        {
          service: request.service,
          method: request.method,
          payload: request.payload,
          requestId: typeof request.requestId === 'string' ? request.requestId : undefined
        },
        SOCKET_INVOKE_EVENT,
      );
    });

    for (const method of methods) {
      socket.on(method.requestEvent, async (message: unknown) => {
        const request = normalizeMethodInvokeRequest(message);

        await handleInvoke(
          {
            service: method.serviceName,
            method: method.methodName,
            payload: request.payload,
            requestId: request.requestId
          },
          method.requestEvent,
        );
      });
    }

    socket.on('disconnect', (reason) => {
      const released = gateway.releaseTarget(socket.id);

      logger.info({ socketId: socket.id, reason }, 'Socket client disconnected');
      logger.debug({ socketId: socket.id, ...released }, 'Socket subscriptions released');
    });
  });

  return io;
};
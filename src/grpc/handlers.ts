import type { ClientReadableStream, ServiceError } from '@grpc/grpc-js';
import { status as grpcStatus } from '@grpc/grpc-js';
import type { Logger } from 'pino';

import { env } from '../config/env';
import type { StreamSubscriptionConfig } from '../config/env';
import { schemaRegistry } from '../schemas/generated';
import type { SocketEmitter } from '../socket/emitter';
import type { GatewayClients, GatewayMethodClient, GatewayServiceClient } from './clients';

type StreamSource = 'startup' | 'api';

const SOCKET_ERROR_EVENT = 'grpc:error';

interface ActiveStream {
  streamKey: string;
  serviceName: string;
  methodName: string;
  eventName: string;
  payload: unknown;
  source: StreamSource;
  startedAt: string;
}

interface StreamDeliveryState {
  broadcast: boolean;
  targetRooms: Set<string>;
}

interface InvokeOptions {
  targetRoom?: string;
}

export class GatewayError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
  }
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

const isServerStreamMethod = (method: GatewayMethodClient): boolean =>
  method.definition.responseStream && !method.definition.requestStream;

const isUnaryMethod = (method: GatewayMethodClient): boolean =>
  !method.definition.responseStream && !method.definition.requestStream;

const methodTimeoutDefaults: Record<string, number> = {
  'GSMClassifier.AnalyzeCell': 45_000,
  'GSMClassifier.ScanBand': 120_000,
  'GSMClassifier.ScanActivity': 120_000,
  'GSMClassifier.CalibratePPM': 120_000,
  'gsm_classifier.v1.GSMClassifier.AnalyzeCell': 45_000,
  'gsm_classifier.v1.GSMClassifier.ScanBand': 120_000,
  'gsm_classifier.v1.GSMClassifier.ScanActivity': 120_000,
  'gsm_classifier.v1.GSMClassifier.CalibratePPM': 120_000
};

const resolveRequestTimeoutMs = (serviceName: string, fullServiceName: string, methodName: string): number => {
  const scopedKey = `${serviceName}.${methodName}`;
  const fullScopedKey = `${fullServiceName}.${methodName}`;

  return (
    env.grpcMethodTimeouts[scopedKey] ??
    env.grpcMethodTimeouts[fullScopedKey] ??
    methodTimeoutDefaults[scopedKey] ??
    methodTimeoutDefaults[fullScopedKey] ??
    env.GRPC_REQUEST_TIMEOUT_MS
  );
};

const getGrpcErrorStatusCode = (error: ServiceError): number => {
  if (error.code === grpcStatus.INVALID_ARGUMENT || error.code === grpcStatus.FAILED_PRECONDITION) {
    return 400;
  }

  if (error.code === grpcStatus.NOT_FOUND) {
    return 404;
  }

  return 502;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const collectDroppedKeys = (input: unknown, parsed: unknown, prefix = ''): string[] => {
  if (!isPlainObject(input) || !isPlainObject(parsed)) {
    return [];
  }

  const droppedKeys: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;

    if (!(key in parsed)) {
      droppedKeys.push(currentPath);
      continue;
    }

    droppedKeys.push(...collectDroppedKeys(value, parsed[key], currentPath));
  }

  return droppedKeys;
};

const validateRequestWithSchema = (typeName: string, payload: unknown, logger: Logger) => {
  const schema = schemaRegistry[typeName];

  if (!schema) {
    logger.warn({ typeName }, 'Schema not found, skipping validation');
    return payload;
  }

  const result = schema.safeParse(payload);

  if (!result.success) {
    logger.error({ typeName, issues: result.error.flatten() }, 'Validation error');
    throw new GatewayError(`Validation failed for ${typeName}`, 400);
  }

  const droppedKeys = collectDroppedKeys(payload, result.data);

  if (droppedKeys.length > 0) {
    logger.error({ typeName, droppedKeys }, 'Validation error due to unknown payload fields');
    throw new GatewayError(`Unknown field(s) for ${typeName}: ${droppedKeys.join(', ')}`, 400);
  }

  return result.data;
};

const validateResponseWithSchema = (typeName: string, payload: unknown, logger: Logger): unknown => {
  const schema = schemaRegistry[typeName];

  if (!schema) {
    logger.warn({ typeName }, 'Schema not found, skipping response validation');
    return payload;
  }

  const result = schema.safeParse(payload);

  if (!result.success) {
    logger.warn(
      { typeName, issues: result.error.flatten() },
      'Response schema validation failed, emitting raw payload to preserve data',
    );
  }

  // Preserve the original gRPC payload shape when relaying over socket events.
  return payload;
};

export interface GrpcGateway {
  start(): Promise<void>;
  invoke(serviceName: string, methodName: string, payload: unknown, options?: InvokeOptions): Promise<unknown>;
  releaseTarget(targetRoom: string): { closedStreams: number; updatedStreams: number };
  getHealth(): {
    status: 'ok';
    readyServices: number;
    totalServices: number;
    activeStreams: number;
  };
  getServices(): Array<{
    serviceName: string;
    fullServiceName: string;
    methods: Array<{
      methodName: string;
      requestType: string;
      responseType: string;
      requestStream: boolean;
      responseStream: boolean;
      eventName: string;
    }>;
  }>;
  getEvents(): { events: string[]; activeStreams: ActiveStream[] };
}

export const createGrpcGateway = ({
  clients,
  emitter,
  logger,
  startupSubscriptions
}: {
  clients: GatewayClients;
  emitter: SocketEmitter;
  logger: Logger;
  startupSubscriptions: StreamSubscriptionConfig[];
}): GrpcGateway => {
  const activeStreams = new Map<
    string,
    { metadata: ActiveStream; delivery: StreamDeliveryState; call: ClientReadableStream<unknown> }
  >();

  const resolveMethod = (serviceName: string, methodName: string): { service: GatewayServiceClient; method: GatewayMethodClient } => {
    const service = clients.getService(serviceName);

    if (!service) {
      throw new GatewayError(`Unknown service: ${serviceName}`, 404);
    }

    const method = service.methods.get(methodName.toLowerCase());

    if (!method) {
      throw new GatewayError(`Unknown method ${methodName} for service ${serviceName}`, 404);
    }

    return { service, method };
  };

  const normalizeResponsePayload = (payload: unknown, responseType: string): unknown => {
    if (responseType !== 'signal_recorder.v1.DownloadRecordingChunk') {
      return payload;
    }

    const unwrapPayload = (value: unknown): unknown => {
      if (Buffer.isBuffer(value)) {
        return { data: value.toString('base64') };
      }

      if (value instanceof Uint8Array) {
        return { data: Buffer.from(value).toString('base64') };
      }

      if (typeof value === 'string') {
        return { data: value };
      }

      if (Array.isArray(value)) {
        return value.map(unwrapPayload);
      }

      if (!value || typeof value !== 'object') {
        return value;
      }

      const anyValue = value as any;
      if ('payload' in anyValue && anyValue.payload != null && anyValue.payload !== anyValue) {
        return unwrapPayload(anyValue.payload);
      }

      const copy: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'payload') {
          continue;
        }

        copy[key] = unwrapPayload(nestedValue);
      }

      return copy;
    };

    try {
      const normalized = unwrapPayload(payload);

      if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
        const copy = { ...(normalized as Record<string, unknown>) };

        if (copy.data != null) {
          const value = copy.data as unknown;

          if (Buffer.isBuffer(value)) {
            copy.data = value.toString('base64');
          } else if (value instanceof Uint8Array) {
            copy.data = Buffer.from(value).toString('base64');
          }
        }

        return copy;
      }

      return normalized;
    } catch {
      return payload;
    }
  };

  const emitValidatedMessage = (
    service: GatewayServiceClient,
    method: GatewayMethodClient,
    payload: unknown,
    delivery: StreamDeliveryState,
  ): unknown | undefined => {
    logger.info(
      {
        serviceName: service.definition.serviceName,
        methodName: method.definition.methodName,
        eventName: method.definition.eventName
      },
      'Incoming message',
    );

    try {
      const normalizedPayload = normalizeResponsePayload(payload, method.definition.responseType);
      const validatedPayload = validateResponseWithSchema(method.definition.responseType, normalizedPayload, logger);

      if (delivery.broadcast) {
        emitter.emit(method.definition.eventName, validatedPayload);
      }

      for (const room of delivery.targetRooms) {
        emitter.emit(method.definition.eventName, validatedPayload, { room });
      }

      return validatedPayload;
    } catch (error) {
      if (error instanceof GatewayError) {
        return undefined;
      }

      throw error;
    }
  };

  const emitStreamError = (
    service: GatewayServiceClient,
    method: GatewayMethodClient,
    error: ServiceError,
    delivery: StreamDeliveryState,
  ): void => {
    const payload = {
      triggerEvent: `grpc:invoke:${service.definition.serviceName}.${method.definition.methodName}`,
      service: service.definition.serviceName,
      method: method.definition.methodName,
      statusCode: getGrpcErrorStatusCode(error),
      message: error.details || error.message || 'Unknown gRPC stream error',
      serviceTarget: service.target
    };

    if (delivery.broadcast) {
      emitter.emit(SOCKET_ERROR_EVENT, payload);
    }

    for (const room of delivery.targetRooms) {
      emitter.emit(SOCKET_ERROR_EVENT, payload, { room });
    }
  };

  const startServerStream = (
    service: GatewayServiceClient,
    method: GatewayMethodClient,
    payload: unknown,
    source: StreamSource,
    targetRoom?: string,
  ) => {
    const parsedPayload = validateRequestWithSchema(method.definition.requestType, payload, logger);
    const streamKey = `${service.definition.fullServiceName}.${method.definition.methodName}:${stableStringify(parsedPayload)}`;

    const existingStream = activeStreams.get(streamKey);

    if (existingStream) {
      if (targetRoom) {
        existingStream.delivery.targetRooms.add(targetRoom);
      }

      return {
        streamKey,
        status: 'already-active',
        eventName: method.definition.eventName
      };
    }

    const call = (service.client as any)[method.clientMethodName](parsedPayload) as ClientReadableStream<unknown>;

    const metadata: ActiveStream = {
      streamKey,
      serviceName: service.definition.serviceName,
      methodName: method.definition.methodName,
      eventName: method.definition.eventName,
      payload: parsedPayload,
      source,
      startedAt: new Date().toISOString()
    };

    const delivery: StreamDeliveryState = {
      broadcast: source === 'startup',
      targetRooms: new Set(targetRoom ? [targetRoom] : [])
    };

    activeStreams.set(streamKey, { metadata, delivery, call });

    logger.info(
      { streamKey, serviceName: metadata.serviceName, methodName: metadata.methodName, source },
      'gRPC stream subscribed',
    );

    call.on('data', (message) => {
      const currentStream = activeStreams.get(streamKey);

      if (!currentStream) {
        return;
      }

      emitValidatedMessage(service, method, message, currentStream.delivery);
    });

    call.on('error', (error: ServiceError) => {
      const currentStream = activeStreams.get(streamKey);

      if (currentStream) {
        emitStreamError(service, method, error, currentStream.delivery);
      }

      activeStreams.delete(streamKey);
      logger.error({ streamKey, error }, 'gRPC stream error');
    });

    call.on('end', () => {
      activeStreams.delete(streamKey);
      logger.info({ streamKey }, 'gRPC stream ended');
    });

    return {
      streamKey,
      status: 'started',
      eventName: method.definition.eventName
    };
  };

  const startConfiguredSubscriptions = async (): Promise<void> => {
    const zeroPayloadStreams = clients.services.flatMap((service) =>
      [...service.methods.values()]
        .filter((method) => isServerStreamMethod(method) && method.definition.requestFieldCount === 0)
        .map((method) => ({ service: service.definition.serviceName, method: method.definition.methodName, payload: {} })),
    );

    for (const service of clients.services) {
      for (const method of service.methods.values()) {
        if (!isServerStreamMethod(method) || method.definition.requestFieldCount === 0) {
          continue;
        }

        const hasConfiguredSubscription = startupSubscriptions.some(
          (subscription) =>
            subscription.service.toLowerCase() === service.definition.serviceName.toLowerCase() &&
            subscription.method.toLowerCase() === method.definition.methodName.toLowerCase(),
        );

        if (!hasConfiguredSubscription) {
          logger.warn(
            {
              serviceName: service.definition.serviceName,
              methodName: method.definition.methodName
            },
            'Streaming method requires payload and was not auto-started',
          );
        }
      }
    }

    for (const subscription of [...zeroPayloadStreams, ...startupSubscriptions]) {
      try {
        const { service, method } = resolveMethod(subscription.service, subscription.method);

        if (!isServerStreamMethod(method)) {
          logger.warn(subscription, 'Configured stream is not a server-stream RPC');
          continue;
        }

        startServerStream(service, method, subscription.payload ?? {}, 'startup');
      } catch (error) {
        logger.error({ subscription, error }, 'Failed to start configured stream');
      }
    }
  };

  return {
    async start() {
      await startConfiguredSubscriptions();
    },
    async invoke(serviceName, methodName, payload, options) {
      const { service, method } = resolveMethod(serviceName, methodName);

      if (isUnaryMethod(method)) {
        const parsedPayload = validateRequestWithSchema(method.definition.requestType, payload, logger);
        const timeoutMs = resolveRequestTimeoutMs(
          service.definition.serviceName,
          service.definition.fullServiceName,
          method.definition.methodName,
        );

        logger.info(
          {
            serviceName: service.definition.serviceName,
            methodName: method.definition.methodName,
            timeoutMs
          },
          'Starting unary gRPC request',
        );

        const response = await new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new GatewayError(`gRPC request timed out for ${service.definition.serviceName}.${method.definition.methodName}`, 504));
          }, timeoutMs);

          (service.client as any)[method.clientMethodName](parsedPayload, (error: ServiceError | null, result: unknown) => {
            clearTimeout(timeout);

            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          });
        }).catch((error: ServiceError | GatewayError) => {
          if (error instanceof GatewayError) {
            throw error;
          }

          throw new GatewayError(error.details || error.message, getGrpcErrorStatusCode(error));
        });

        logger.info(
          {
            serviceName: service.definition.serviceName,
            methodName: method.definition.methodName
          },
          'Unary gRPC request completed',
        );

        const emittedPayload = emitValidatedMessage(service, method, response, {
          broadcast: !options?.targetRoom,
          targetRooms: new Set(options?.targetRoom ? [options.targetRoom] : [])
        });

        return {
          mode: 'unary',
          eventName: method.definition.eventName,
          payload: emittedPayload
        };
      }

      if (isServerStreamMethod(method)) {
        const started = startServerStream(service, method, payload, 'api', options?.targetRoom);

        return {
          mode: 'server-stream',
          ...started
        };
      }

      throw new GatewayError('Client-streaming and bidirectional-streaming methods are not supported', 400);
    },
    releaseTarget(targetRoom) {
      let closedStreams = 0;
      let updatedStreams = 0;

      for (const [streamKey, stream] of activeStreams.entries()) {
        if (!stream.delivery.targetRooms.delete(targetRoom)) {
          continue;
        }

        if (!stream.delivery.broadcast && stream.delivery.targetRooms.size === 0) {
          stream.call.cancel();
          activeStreams.delete(streamKey);
          closedStreams += 1;
          continue;
        }

        updatedStreams += 1;
      }

      return { closedStreams, updatedStreams };
    },
    getHealth() {
      return {
        status: 'ok',
        readyServices: clients.readyServices,
        totalServices: clients.services.length,
        activeStreams: activeStreams.size
      };
    },
    getServices() {
      return clients.services.map((service) => ({
        serviceName: service.definition.serviceName,
        fullServiceName: service.definition.fullServiceName,
        methods: service.definition.methods.map((method) => ({
          methodName: method.methodName,
          requestType: method.requestType,
          responseType: method.responseType,
          requestStream: method.requestStream,
          responseStream: method.responseStream,
          eventName: method.eventName
        }))
      }));
    },
    getEvents() {
      return {
        events: clients.services.flatMap((service) => service.definition.methods.map((method) => method.eventName)),
        activeStreams: [...activeStreams.values()].map((entry) => entry.metadata)
      };
    }
  };
};
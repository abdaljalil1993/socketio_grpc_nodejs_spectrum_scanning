import * as grpc from '@grpc/grpc-js';

import type { Logger } from 'pino';

import type { ProtoMethodRegistry, ProtoServiceRegistry } from './registry';
import { protoRegistry } from './registry';

export interface GatewayMethodClient {
  definition: ProtoMethodRegistry;
  clientMethodName: string;
}

export interface GatewayServiceClient {
  definition: ProtoServiceRegistry;
  target: string;
  client: grpc.Client;
  methods: Map<string, GatewayMethodClient>;
}

export interface GatewayClients {
  services: GatewayServiceClient[];
  readonly readyServices: number;
  getService(serviceName: string): GatewayServiceClient | undefined;
  connect(timeoutMs: number, logger: Logger): Promise<{ readyServices: number; failedServices: number }>;
}

const lowerFirst = (value: string): string => `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

const normalizeRpcMethodName = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const collectClientMethodNames = (client: grpc.Client): Set<string> => {
  const methodNames = new Set<string>();
  let currentPrototype: object | null = Object.getPrototypeOf(client);

  while (currentPrototype && currentPrototype !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(currentPrototype)) {
      if (key === 'constructor') {
        continue;
      }

      if (typeof (client as unknown as Record<string, unknown>)[key] === 'function') {
        methodNames.add(key);
      }
    }

    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  return methodNames;
};

const resolveClientMethodName = (
  client: grpc.Client,
  methodName: string,
  logger: Logger,
  serviceName: string,
): string => {
  const clientMethodNames = collectClientMethodNames(client);
  const directCandidates = [lowerFirst(methodName), methodName];

  for (const candidate of directCandidates) {
    if (clientMethodNames.has(candidate)) {
      return candidate;
    }
  }

  const normalizedMethodName = normalizeRpcMethodName(methodName);
  const normalizedMatch = [...clientMethodNames].find(
    (candidate) => normalizeRpcMethodName(candidate) === normalizedMethodName,
  );

  if (normalizedMatch) {
    logger.warn(
      { serviceName, methodName, resolvedClientMethodName: normalizedMatch },
      'Resolved gRPC client method name using normalized match',
    );

    return normalizedMatch;
  }

  const fallback = lowerFirst(methodName);

  logger.warn(
    {
      serviceName,
      methodName,
      fallback,
      availableClientMethods: [...clientMethodNames].sort()
    },
    'Unable to resolve gRPC client method name exactly; using fallback',
  );

  return fallback;
};

const resolveServiceConstructor = (
  grpcObject: grpc.GrpcObject,
  service: ProtoServiceRegistry,
): grpc.ServiceClientConstructor | undefined => {
  let namespace: unknown = grpcObject;

  for (const part of service.packageName.split('.')) {
    if (!namespace || typeof namespace !== 'object') {
      return undefined;
    }

    namespace = (namespace as Record<string, unknown>)[part];
  }

  if (!namespace || typeof namespace !== 'object') {
    return undefined;
  }

  const serviceConstructor = (namespace as Record<string, unknown>)[service.serviceName];

  if (typeof serviceConstructor !== 'function') {
    return undefined;
  }

  return serviceConstructor as grpc.ServiceClientConstructor;
};

export const createGrpcClients = (
  grpcObject: grpc.GrpcObject,
  target: string,
  serviceTargets: Record<string, string>,
  useTls: boolean,
  logger: Logger,
): GatewayClients => {
  const lookup = new Map<string, GatewayServiceClient>();
  const credentials = useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();

  const services = protoRegistry.services.flatMap((serviceDefinition) => {
    const ServiceClient = resolveServiceConstructor(grpcObject, serviceDefinition);

    if (!ServiceClient) {
      logger.warn({ serviceName: serviceDefinition.fullServiceName }, 'Service constructor not found in gRPC object');
      return [];
    }

    const serviceTarget =
      serviceTargets[serviceDefinition.serviceName] ??
      serviceTargets[serviceDefinition.fullServiceName] ??
      target;

    const client = new ServiceClient(serviceTarget, credentials);
    const serviceClient: GatewayServiceClient = {
      definition: serviceDefinition,
      target: serviceTarget,
      client,
      methods: new Map(
        serviceDefinition.methods.map((method) => [method.methodName.toLowerCase(), {
          definition: method,
          clientMethodName: resolveClientMethodName(client, method.methodName, logger, serviceDefinition.serviceName)
        }]),
      )
    };

    lookup.set(serviceDefinition.serviceName.toLowerCase(), serviceClient);
    lookup.set(serviceDefinition.fullServiceName.toLowerCase(), serviceClient);

    return [serviceClient];
  });

  let readyServices = 0;

  return {
    services,
    get readyServices() {
      return readyServices;
    },
    getService(serviceName) {
      return lookup.get(serviceName.toLowerCase());
    },
    async connect(timeoutMs, scopedLogger) {
      let failedServices = 0;
      const deadline = Date.now() + timeoutMs;

      await Promise.all(
        services.map(
          (service) =>
            new Promise<void>((resolve) => {
              service.client.waitForReady(deadline, (error) => {
                if (error) {
                  failedServices += 1;
                  scopedLogger.error(
                    {
                      serviceName: service.definition.fullServiceName,
                      target: service.target,
                      err: error,
                      errorMessage: error.message,
                      errorCode: (error as NodeJS.ErrnoException).code,
                      errorName: error.name
                    },
                    'gRPC client failed readiness check',
                  );
                  resolve();
                  return;
                }

                readyServices += 1;
                scopedLogger.info({ serviceName: service.definition.fullServiceName, target: service.target }, 'gRPC connected');
                resolve();
              });
            }),
        ),
      );

      return {
        readyServices,
        failedServices
      };
    }
  };
};
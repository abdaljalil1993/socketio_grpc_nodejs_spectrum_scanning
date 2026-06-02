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

    const client = new ServiceClient(target, credentials);
    const serviceClient: GatewayServiceClient = {
      definition: serviceDefinition,
      client,
      methods: new Map(
        serviceDefinition.methods.map((method) => [method.methodName.toLowerCase(), {
          definition: method,
          clientMethodName: lowerFirst(method.methodName)
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
                    { serviceName: service.definition.fullServiceName, error },
                    'gRPC client failed readiness check',
                  );
                  resolve();
                  return;
                }

                readyServices += 1;
                scopedLogger.info({ serviceName: service.definition.fullServiceName }, 'gRPC connected');
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
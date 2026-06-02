import http from 'node:http';

import { createApp } from './app';
import { env } from './config/env';
import { createGrpcClients } from './grpc/clients';
import { createGrpcGateway } from './grpc/handlers';
import { collectProtoFiles, loadGrpcObject } from './grpc/loader';
import { createSocketEmitter } from './socket/emitter';
import { createSocketServer } from './socket';
import { logger } from './utils/logger';

const bootstrap = async (): Promise<void> => {
  const protoFiles = collectProtoFiles(env.GRPC_PROTO_DIR);
  const grpcObject = loadGrpcObject(protoFiles, env.GRPC_PROTO_DIR);
  const grpcClients = createGrpcClients(grpcObject, env.GRPC_TARGET, env.GRPC_USE_TLS, logger);
  const socketEmitter = createSocketEmitter(logger);
  const gateway = createGrpcGateway({
    clients: grpcClients,
    emitter: socketEmitter,
    logger,
    startupSubscriptions: env.grpcStreamSubscriptions
  });
  const app = createApp(gateway, logger);
  const server = http.createServer(app);
  const io = createSocketServer(server, gateway, logger);

  socketEmitter.attach(io);

  const connectionSummary = await grpcClients.connect(env.GRPC_CONNECT_TIMEOUT_MS, logger);

  if (connectionSummary.readyServices === 0) {
    throw new Error('No gRPC services became ready. Gateway startup aborted.');
  }

  await gateway.start();

  server.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        host: env.HOST,
        port: env.PORT,
        grpcTarget: env.GRPC_TARGET,
        protoFiles,
        readyServices: connectionSummary.readyServices
      },
      'Server started',
    );
  });
};

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Server startup failed');
  process.exit(1);
});
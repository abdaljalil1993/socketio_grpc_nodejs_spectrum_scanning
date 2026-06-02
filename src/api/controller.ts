import type { Request, Response } from 'express';

import { GatewayError } from '../grpc/handlers';
import type { GrpcGateway } from '../grpc/handlers';

export const createApiController = (gateway: GrpcGateway) => ({
  health(_request: Request, response: Response) {
    response.json(gateway.getHealth());
  },
  services(_request: Request, response: Response) {
    response.json({ services: gateway.getServices() });
  },
  events(_request: Request, response: Response) {
    response.json(gateway.getEvents());
  },
  async invoke(request: Request, response: Response): Promise<void> {
    const serviceName = request.params.service;
    const methodName = request.params.method;

    if (!serviceName || !methodName || Array.isArray(serviceName) || Array.isArray(methodName)) {
      throw new GatewayError('Service and method route parameters are required', 400);
    }

    const result = await gateway.invoke(serviceName, methodName, request.body ?? {});
    response.json(result);
  }
});
// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

function makeRequest(): Request {
  return {
    headers: { 'x-request-id': 'req-test-1' },
    method: 'GET',
    originalUrl: '/api/orders?x=1',
    url: '/api/orders?x=1',
    baseUrl: '/api',
    route: { path: '/orders' },
    ip: '127.0.0.1',
  } as unknown as Request;
}

describe('RequestLoggingMiddleware', () => {
  it('giữ request-id, ghi JSON log và metric khi finish', () => {
    const metrics = new MetricsService();
    const middleware = new RequestLoggingMiddleware(
      new RequestContextService(),
      metrics,
    );
    const request = makeRequest();
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    };
    response.statusCode = 201;
    const headers: Record<string, string> = {};
    response.setHeader = (name, value) => {
      headers[name] = value;
    };
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const next = jest.fn() as NextFunction;

    middleware.use(request, response as unknown as Response, next);
    expect(headers['x-request-id']).toBe('req-test-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(metrics.render()).toContain('http_requests_in_flight 1');

    response.emit('finish');
    expect(metrics.render()).toContain(
      'http_requests_total{method="GET",route="/api/orders",status="201"} 1',
    );
    const line = String(write.mock.calls[0]?.[0] ?? '');
    const log = JSON.parse(line) as Record<string, unknown>;
    expect(log).toMatchObject({
      msg: 'http.request',
      requestId: 'req-test-1',
      method: 'GET',
      path: '/api/orders',
      route: '/api/orders',
      status: 201,
      tenantId: 'default',
      user: null,
    });
    expect(typeof log.durationMs).toBe('number');
    write.mockRestore();
  });

  it('tự sinh request-id khi header không hợp lệ', () => {
    const metrics = new MetricsService();
    const middleware = new RequestLoggingMiddleware(
      new RequestContextService(),
      metrics,
    );
    const request = makeRequest();
    request.headers['x-request-id'] = 'bad id with spaces';
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    };
    response.statusCode = 200;
    const headers: Record<string, string> = {};
    response.setHeader = (name, value) => {
      headers[name] = value;
    };
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    middleware.use(request, response as unknown as Response, jest.fn());
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id']).not.toBe('bad id with spaces');
    response.emit('finish');
    write.mockRestore();
  });
});

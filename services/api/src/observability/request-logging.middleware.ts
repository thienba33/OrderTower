// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context.service';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestIdFromHeader(value: unknown): string {
  if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value.trim())) {
    return value.trim();
  }
  return randomUUID();
}

function routeOf(request: Request): string {
  const route = (request.route as { path?: string } | undefined)?.path;
  if (!route) {
    return 'unmatched';
  }
  const base = request.baseUrl ?? '';
  return `${base}${route}` || '/';
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? null;
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly context: RequestContextService,
    private readonly metrics: MetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = requestIdFromHeader(request.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();
    response.setHeader('x-request-id', requestId);
    this.metrics.startRequest();

    response.on('finish', () => {
      this.metrics.finishRequest();
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = routeOf(request);
      const status = response.statusCode;
      this.metrics.recordRequest(request.method, route, status, durationMs);
      const user = (
        request as Request & { user?: { username?: string; tenantId?: string } }
      ).user;
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      const line = JSON.stringify({
        time: new Date().toISOString(),
        level,
        msg: 'http.request',
        requestId,
        method: request.method,
        path,
        route,
        status,
        durationMs: Number(durationMs.toFixed(3)),
        tenantId: user?.tenantId ?? 'default',
        user: user?.username ?? null,
        ip: clientIp(request),
      });
      process.stdout.write(`${line}\n`);
    });

    this.context.run(
      { requestId, startedAt: Number(startedAt) / 1_000_000 },
      () => next(),
    );
  }
}

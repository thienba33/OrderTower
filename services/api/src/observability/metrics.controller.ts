// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Prometheus scrape trực tiếp API trong compose. APISIX vẫn chặn /api/*
  // bằng openid-connect nếu gọi qua gateway.
  @Get()
  @Public()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('cache-control', 'no-store')
  getMetrics(): string {
    return this.metrics.render();
  }
}

// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    RequestContextService,
    RequestLoggingMiddleware,
  ],
  exports: [MetricsService, RequestContextService, RequestLoggingMiddleware],
})
export class ObservabilityModule {}

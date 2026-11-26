// SPDX-License-Identifier: Apache-2.0
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // APISIX chuyển /api/* nguyên vẹn tới API, nên tiền tố /api đặt ở đây.
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API đang chạy trên cổng ${port}.`);
}

void bootstrap();

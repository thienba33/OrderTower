// SPDX-License-Identifier: Apache-2.0
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'ordertower-api' };
  }
}

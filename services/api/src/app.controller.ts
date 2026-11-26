// SPDX-License-Identifier: Apache-2.0
import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

// Health công khai để Docker và giám sát kiểm tra, mọi endpoint khác đều
// cần access token Keycloak.
@Controller('health')
export class AppController {
  @Public()
  @Get()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'ordertower-api' };
  }
}

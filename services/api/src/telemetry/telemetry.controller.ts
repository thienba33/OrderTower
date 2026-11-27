// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  TELEMETRY_READ_ROLES,
  TELEMETRY_WRITE_ROLES,
} from '../auth/permissions';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { TelemetryService } from './telemetry.service';
import type {
  IngestTelemetryInput,
  SimulateResult,
  TelemetryReading,
} from './telemetry.types';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  // Thiet bi/cam bien gui reading bang device key, khong dung JWT nguoi
  // dung. Production nen thay bang mTLS/HMAC/key rotation; day la muc toi
  // thieu cho demo IT/OT.
  @Post('readings')
  @Public()
  ingest(
    @Body() body: IngestTelemetryInput,
    @Headers('x-device-key') deviceKey?: string,
  ): Promise<TelemetryReading> {
    this.assertDeviceKey(deviceKey);
    return this.telemetry.ingest(body);
  }

  @Get('readings')
  @Roles(...TELEMETRY_READ_ROLES)
  list(
    @Query('vehicleId') vehicleId?: string,
    @Query('limit') limit?: string,
  ): Promise<TelemetryReading[]> {
    return this.telemetry.list(vehicleId, limit);
  }

  // Tao du lieu mo phong cho demo. Chi vai van hanh moi duoc goi.
  @Post('simulate')
  @Roles(...TELEMETRY_WRITE_ROLES)
  simulate(@Req() req: AuthenticatedRequest): Promise<SimulateResult> {
    return this.telemetry.simulate(req.user);
  }

  private assertDeviceKey(deviceKey?: string): void {
    const expected = process.env.TELEMETRY_DEVICE_KEY;
    if (!expected) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình TELEMETRY_DEVICE_KEY cho endpoint thiết bị.',
      );
    }
    if (deviceKey !== expected) {
      throw new UnauthorizedException('Device key không hợp lệ.');
    }
  }
}

@Controller('twins')
export class TwinController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('vehicles')
  @Roles(...TELEMETRY_READ_ROLES)
  list() {
    return this.telemetry.listTwins();
  }

  @Get('vehicles/:id')
  @Roles(...TELEMETRY_READ_ROLES)
  getOne(@Param('id') id: string) {
    return this.telemetry.getTwin(id);
  }
}

@Controller('ngsi-ld/v1')
export class NgsiLdController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('entities')
  @Roles(...TELEMETRY_READ_ROLES)
  list(@Query('type') type?: string) {
    return this.telemetry.listNgsiLd(type);
  }
}

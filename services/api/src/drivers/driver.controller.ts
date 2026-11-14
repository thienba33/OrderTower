// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { DriversService } from './driver.service';
import type {
  AssignVehicleInput,
  CreateDriverInput,
  Driver,
  DriverStatus,
} from './driver.types';

@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  create(
    @Body() body: CreateDriverInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.create(body, req.user);
  }

  @Get()
  list(@Query('status') status?: DriverStatus): Promise<Driver[]> {
    return this.drivers.list({
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Driver> {
    return this.drivers.get(id);
  }

  @Post(':id/assign-vehicle')
  assignVehicle(
    @Param('id') id: string,
    @Body() body: AssignVehicleInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.assignVehicle(id, body, req.user);
  }

  @Post(':id/unassign-vehicle')
  unassignVehicle(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.unassignVehicle(id, req.user);
  }

  @Post(':id/rest')
  rest(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.rest(id, req.user);
  }

  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.activate(id, req.user);
  }
}

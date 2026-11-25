// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  DRIVER_READ_ROLES,
  DRIVER_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
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
  @Roles(...DRIVER_WRITE_ROLES)
  create(
    @Body() body: CreateDriverInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.create(body, req.user);
  }

  @Get()
  @Roles(...DRIVER_READ_ROLES)
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: DriverStatus,
  ): Promise<Driver[]> {
    return this.drivers.listForCaller(
      {
        ...(status ? { status } : {}),
      },
      req.user,
    );
  }

  @Get(':id')
  @Roles(...DRIVER_READ_ROLES)
  getOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.getForCaller(id, req.user);
  }

  @Post(':id/assign-vehicle')
  @Roles(...DRIVER_WRITE_ROLES)
  assignVehicle(
    @Param('id') id: string,
    @Body() body: AssignVehicleInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.assignVehicle(id, body, req.user);
  }

  @Post(':id/unassign-vehicle')
  @Roles(...DRIVER_WRITE_ROLES)
  unassignVehicle(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.unassignVehicle(id, req.user);
  }

  @Post(':id/rest')
  @Roles(...DRIVER_WRITE_ROLES)
  rest(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.rest(id, req.user);
  }

  @Post(':id/activate')
  @Roles(...DRIVER_WRITE_ROLES)
  activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Driver> {
    return this.drivers.activate(id, req.user);
  }
}

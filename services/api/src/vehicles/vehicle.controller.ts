// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  VEHICLE_READ_ROLES,
  VEHICLE_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { VehiclesService } from './vehicle.service';
import type {
  CreateVehicleInput,
  Vehicle,
  VehicleStatus,
} from './vehicle.types';

@Controller('vehicles')
@Roles(...VEHICLE_READ_ROLES)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  @Roles(...VEHICLE_WRITE_ROLES)
  create(
    @Body() body: CreateVehicleInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Vehicle> {
    return this.vehicles.create(body, req.user);
  }

  @Get()
  list(@Query('status') status?: VehicleStatus): Promise<Vehicle[]> {
    return this.vehicles.list({
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Vehicle> {
    return this.vehicles.get(id);
  }

  @Post(':id/maintenance')
  @Roles(...VEHICLE_WRITE_ROLES)
  maintenance(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Vehicle> {
    return this.vehicles.maintenance(id, req.user);
  }

  @Post(':id/activate')
  @Roles(...VEHICLE_WRITE_ROLES)
  activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Vehicle> {
    return this.vehicles.activate(id, req.user);
  }
}

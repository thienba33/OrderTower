// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { VehiclesService } from './vehicle.service';
import type {
  CreateVehicleInput,
  Vehicle,
  VehicleStatus,
} from './vehicle.types';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
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
  maintenance(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Vehicle> {
    return this.vehicles.maintenance(id, req.user);
  }

  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Vehicle> {
    return this.vehicles.activate(id, req.user);
  }
}

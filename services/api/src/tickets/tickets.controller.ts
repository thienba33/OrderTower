// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { TICKET_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { TicketsService } from './tickets.service';
import type {
  ChangeTicketStatusInput,
  CreateTicketInput,
  Ticket,
  TicketChannel,
  TicketKpis,
  TicketStatus,
  TicketType,
} from './tickets.types';

@Controller('tickets')
@Roles(...TICKET_READ_ROLES)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(
    @Body() body: CreateTicketInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Ticket> {
    return this.tickets.create(body, req.user);
  }

  // /tickets/kpis phải khai báo trước /tickets/:id, không thì "kpis" bị
  // nhận làm id.
  @Get('kpis')
  kpis(): Promise<TicketKpis> {
    return this.tickets.kpis();
  }

  @Get()
  list(
    @Query('type') type?: TicketType,
    @Query('status') status?: TicketStatus,
    @Query('channel') channel?: TicketChannel,
    @Query('needsCall') needsCall?: string,
    @Query('q') q?: string,
  ): Promise<Ticket[]> {
    return this.tickets.list({
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(needsCall === 'true'
        ? { needsCall: true }
        : needsCall === 'false'
          ? { needsCall: false }
          : {}),
      ...(q ? { q } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Ticket> {
    return this.tickets.get(id);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() body: ChangeTicketStatusInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Ticket> {
    return this.tickets.changeStatus(id, body, req.user);
  }
}

// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CHANNEL_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ChannelsService } from './channel.service';
import type {
  Channel,
  ChannelStatus,
  CreateChannelInput,
} from './channel.types';

@Controller('channels')
@Roles(...CHANNEL_READ_ROLES)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(
    @Body() body: CreateChannelInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Channel> {
    return this.channels.create(body, req.user);
  }

  @Get()
  list(@Query('status') status?: ChannelStatus): Promise<Channel[]> {
    return this.channels.list({
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Channel> {
    return this.channels.get(id);
  }

  @Post(':id/pause')
  pause(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Channel> {
    return this.channels.pause(id, req.user);
  }

  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Channel> {
    return this.channels.activate(id, req.user);
  }
}

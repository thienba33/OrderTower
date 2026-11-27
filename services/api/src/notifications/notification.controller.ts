// SPDX-License-Identifier: Apache-2.0
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { INTERNAL_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from './notification.service';
import type { Notification, NotificationList } from './notification.types';

@Controller('notifications')
@Roles(...INTERNAL_ROLES)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationList> {
    return this.notifications.list(req.user, {
      unreadOnly: unreadOnly === undefined ? false : parseBoolean(unreadOnly),
      ...(limit !== undefined
        ? { limit: Number.parseInt(limit, 10) }
        : {}),
    });
  }

  @Post('read-all')
  markAllRead(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ updated: number }> {
    return this.notifications.markAllRead(req.user);
  }

  @Post(':id/read')
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Notification> {
    return this.notifications.markRead(req.user, id);
  }
}

function parseBoolean(value: string): boolean {
  return value === '1' || value.toLowerCase() === 'true';
}

// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PublicTrackingService } from './public-tracking.service';
import type { PublicTrackingResult } from './public-tracking.types';

// Tra cứu đơn cho khách vãng lai: không cần đăng nhập, khách chứng minh
// là chủ đơn bằng mã đơn + SĐT lúc đặt đơn. Endpoint này là ngoại lệ
// duy nhất ngoài /api/health được mở công khai.
@Controller('public/tracking')
export class PublicTrackingController {
  constructor(private readonly tracking: PublicTrackingService) {}

  @Public()
  @Get()
  track(
    @Query('orderId') orderId?: string,
    @Query('phone') phone?: string,
  ): Promise<PublicTrackingResult> {
    return this.tracking.track(orderId, phone);
  }
}

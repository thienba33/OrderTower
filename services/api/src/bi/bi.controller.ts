// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { BI_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { BiService } from './bi.service';
import type {
  DecisionRecommendationInput,
  RecordFeedbackInput,
} from './bi.types';

// Lớp BI pilot: chỉ cảnh báo + đề xuất, không tự đặt hàng. Endpoint yêu
// cầu đăng nhập (không có @Public): AuthGuard toàn cục chặn khách vãng
// lai. Đọc forecast/anomalies/dx-score chỉ cần đăng nhập; quyết định đề
// xuất và ghi phản hồi chỉ Quản lý/Quản trị viên (BiService kiểm tra).
@Controller('bi')
@Roles(...BI_READ_ROLES)
export class BiController {
  constructor(private readonly biService: BiService) {}

  @Get('forecast')
  forecast() {
    return this.biService.forecast();
  }

  @Get('anomalies')
  anomalies() {
    return this.biService.anomalies();
  }

  @Get('recommendations')
  recommendations() {
    return this.biService.listRecommendations();
  }

  @Get('recommendations/:id')
  recommendation(@Param('id') id: string) {
    return this.biService.getRecommendation(id);
  }

  @Post('recommendations/:id/decision')
  decide(
    @Param('id') id: string,
    @Body() body: DecisionRecommendationInput,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.biService.decideRecommendation(id, body, req.user);
  }

  @Post('recommendations/:id/feedback')
  feedback(
    @Param('id') id: string,
    @Body() body: RecordFeedbackInput,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.biService.recordFeedback(id, body, req.user);
  }

  @Get('feedback')
  feedbackList() {
    return this.biService.listFeedback();
  }

  @Get('dx-score')
  dxScore() {
    return this.biService.dxScore();
  }

  @Get('dx-score/latest')
  latestDxScore() {
    return this.biService.latestDxScoreSnapshot();
  }
}

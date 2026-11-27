// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ADDRESS_SPLIT_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { AddressProposalService } from './address-proposal.service';
import { AddressService } from './address.service';
import type {
  AddressEvaluation,
  AddressInput,
  AddressProposal,
  DecisionProposalInput,
  SuggestInput,
  SuggestResponse,
} from './address.types';

const ADDRESS_FIELDS: Array<keyof AddressInput> = [
  'province',
  'district',
  'ward',
  'street',
];

@Controller('address')
export class AddressController {
  constructor(
    private readonly address: AddressService,
    private readonly proposals: AddressProposalService,
  ) {}

  @Post('evaluate')
  evaluate(@Body() body: AddressInput): AddressEvaluation {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('body phải là 1 object địa chỉ.');
    }
    for (const field of ADDRESS_FIELDS) {
      const value = body[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`${field} phải là dạng chuỗi khi có.`);
      }
    }
    return this.address.evaluate(body);
  }

  // Đề xuất chuẩn hóa địa chỉ (AI số 1). Chỉ vai mở được màn phân tách
  // địa chỉ mới gọi được: điều phối viên, CSKH, quản trị viên (xem
  // ADDRESS_SPLIT_ROLES; quản lý không mở được màn này nên không gọi).
  // Body là 1 trong 3 dạng: { orderId }, { orderId, raw },
  // { address: { province, ward, street } }.
  @Post('suggest')
  @Roles(...ADDRESS_SPLIT_ROLES)
  suggest(
    @Req() req: AuthenticatedRequest,
    @Body() body: SuggestInput,
  ): Promise<SuggestResponse> {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('body phải là 1 object.');
    }
    if (body.orderId !== undefined && typeof body.orderId !== 'string') {
      throw new BadRequestException('orderId phải là dạng chuỗi khi có.');
    }
    if (body.raw !== undefined && typeof body.raw !== 'string') {
      throw new BadRequestException('raw phải là dạng chuỗi khi có.');
    }
    if (body.address !== undefined) {
      this.assertAddressInput(body.address);
    }
    return this.proposals.suggest(req.user, body);
  }

  // Xem 1 đề xuất: mọi người dùng đã đăng nhập đều xem được (không gắn
  // @Roles), giống các endpoint đọc nội bộ cũ.
  @Get('proposals/:id')
  getProposal(@Param('id') id: string): Promise<AddressProposal> {
    return this.proposals.getProposal(id);
  }

  // Duyệt đề xuất: approved áp dụng qua đường sửa đơn có sẵn (người duyệt
  // được sửa địa chỉ trong modal qua trường address), rejected bắt buộc có
  // lý do. Chỉ vai mở được màn phân tách địa chỉ mới duyệt được.
  @Post('proposals/:id/decision')
  @Roles(...ADDRESS_SPLIT_ROLES)
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: DecisionProposalInput,
  ): Promise<AddressProposal> {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('body phải là 1 object.');
    }
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      throw new BadRequestException('decision phải là approved hoặc rejected.');
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      throw new BadRequestException('reason phải là dạng chuỗi khi có.');
    }
    if (body.address !== undefined) {
      this.assertAddressInput(body.address);
    }
    return this.proposals.decide(req.user, id, body);
  }

  private assertAddressInput(address: unknown): void {
    if (typeof address !== 'object' || address === null) {
      throw new BadRequestException('address phải là 1 object địa chỉ.');
    }
    for (const field of ADDRESS_FIELDS) {
      const value = (address as AddressInput)[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`${field} phải là dạng chuỗi khi có.`);
      }
    }
  }
}

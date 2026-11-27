// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { CLOSED_STATES, OrdersService } from '../orders/orders.service';
import { AddressService, MIN_ADDRESS_TRUST } from './address.service';
import {
  ADDRESS_PROPOSAL_STORE,
} from './address-proposal.store';
import {
  AddressInput,
  AddressProposal,
  AddressProposalStore,
  AddressSnapshot,
  DecisionProposalInput,
  SuggestInput,
  SuggestResponse,
} from './address.types';

function formatAddress(address: AddressInput): string {
  const parts = [address.province, address.district, address.ward, address.street].filter(
    (part) => part && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' / ') : '(trống)';
}

// Đề xuất chuẩn hóa địa chỉ + duyệt áp dụng (AI số 1, xem bản dự thảo
// du-thao-ai-chuan-hoa-dia-chi.md mục 4-5). Luồng:
//   - mức cao (tin cậy 100): tự áp dụng vào đơn qua đường sửa đơn có sẵn
//     (OrdersService.update, không có đường ghi thứ hai), ghi đề xuất
//     "Tự áp dụng" + audit address-proposal.auto-applied;
//   - mức giữa (80): lưu đề xuất "Chờ duyệt" cho modal duyệt tay +
//     audit address-proposal.created;
//   - mức thấp (<= 60): KHÔNG có đề xuất áp dụng được, trả lý do từng
//     phần + danh sách phường đúng để nhập tay.
// Đề xuất đã quyết định thì quyết định lại = 409. Từ chối bắt buộc có lý
// do. Đơn đã đóng không tự áp dụng/lưu đề xuất được (sửa đơn đã đóng cần
// phê duyệt riêng, xem OrdersService.update).
@Injectable()
export class AddressProposalService implements OnModuleInit {
  private nextNumber = 1001;

  constructor(
    @Inject(ADDRESS_PROPOSAL_STORE)
    private readonly store: AddressProposalStore,
    private readonly addressService: AddressService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const ids = await this.store.listIds();
    this.nextNumber = computeNextNumber(ids, 'AC');
  }

  async suggest(caller: Caller, input: SuggestInput): Promise<SuggestResponse> {
    const hasOrder = !!input.orderId;
    const hasRaw = !!input.raw && input.raw.trim().length > 0;
    const hasAddress = !!input.address;
    if (!hasOrder && !hasRaw && !hasAddress) {
      throw new BadRequestException('Cần gửi orderId, raw hoặc address.');
    }
    if (hasRaw && hasAddress) {
      throw new BadRequestException('Chỉ gửi raw hoặc address, không gửi cả hai.');
    }

    const order = hasOrder
      ? await this.orders.findOne(input.orderId!)
      : null;

    // Địa chỉ trước + đề xuất. raw thắng khi gửi kèm orderId (chuỗi dán
    // vào là địa chỉ cần chuẩn hóa); address thắng khi gửi kèm orderId.
    let beforeAddress: AddressInput;
    let suggestion: ReturnType<AddressService['suggestFromAddress']>;
    if (hasRaw) {
      const { suggestion: s, parts } = this.addressService.suggestFromRaw(input.raw!);
      suggestion = s;
      beforeAddress = {
        province: parts.province,
        ward: parts.ward,
        district: parts.district,
        street: parts.street,
      };
    } else if (hasAddress) {
      beforeAddress = input.address!;
      suggestion = this.addressService.suggestFromAddress(input.address!);
    } else {
      beforeAddress = order!.address ?? {};
      suggestion = this.addressService.suggestFromParts({
        province: beforeAddress.province,
        ward: beforeAddress.ward,
        district: beforeAddress.district,
        street: beforeAddress.street ?? '',
      });
    }

    const beforeEval = this.addressService.evaluate(beforeAddress);
    const before: AddressSnapshot = {
      address: beforeAddress,
      trust: beforeEval.trust,
      level: beforeEval.level,
      reasons: suggestion.reasons,
    };

    // Địa chỉ sau: chỉ giữ tỉnh/phường/đường đã xác định được. Quận/huyện
    // cũ không còn cấp hành chính nên đề xuất không mang theo nữa.
    const afterAddress: AddressInput = {};
    if (suggestion.province) afterAddress.province = suggestion.province;
    if (suggestion.ward) afterAddress.ward = suggestion.ward;
    if (suggestion.street) afterAddress.street = suggestion.street;
    const afterEval = this.addressService.evaluate(afterAddress);
    const after: AddressSnapshot = {
      address: afterAddress,
      trust: afterEval.trust,
      level: afterEval.level,
      reasons: suggestion.reasons,
    };

    // Địa chỉ đã đạt mức cao thì không cần đề xuất.
    if (beforeEval.trust >= 95) {
      return {
        proposal: null,
        before,
        after,
        applied: false,
        note: 'Địa chỉ đã đạt độ tin cậy cao, không cần đề xuất.',
      };
    }

    const isClosed = order ? CLOSED_STATES.includes(order.state) : false;

    if (afterEval.trust >= 95) {
      if (!order) {
        return {
          proposal: null,
          before,
          after,
          applied: false,
          note: 'Đề xuất đạt độ tin cậy cao nhưng không kèm đơn nên chưa áp dụng; gửi kèm orderId để tự áp dụng.',
        };
      }
      if (isClosed) {
        return {
          proposal: null,
          before,
          after,
          applied: false,
          note: 'Đơn đã đóng nên không tự áp dụng được; sửa địa chỉ qua luồng phê duyệt sửa đơn đã đóng.',
        };
      }
      // Áp dụng qua đường sửa đơn có sẵn, rồi mới lưu đề xuất.
      await this.orders.update(order.id, { address: afterAddress }, caller);
      const now = new Date().toISOString();
      const proposal: AddressProposal = {
        id: this.nextId(),
        orderId: order.id,
        status: 'Tự áp dụng',
        before,
        after,
        requestedBy: caller.username,
        requestedAt: now,
        decidedBy: caller.username,
        decidedAt: now,
        decisionReason: null,
        appliedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.save(proposal);
      await this.appendAudit(
        caller,
        'address-proposal.auto-applied',
        order.id,
        formatAddress(beforeAddress),
        formatAddress(afterAddress),
        `Tin cậy ${beforeEval.trust} -> ${afterEval.trust}.`,
      );
      return { proposal, before, after, applied: true };
    }

    if (afterEval.trust >= MIN_ADDRESS_TRUST) {
      if (!order) {
        return {
          proposal: null,
          before,
          after,
          applied: false,
          note: 'Đề xuất cần duyệt nhưng không kèm đơn nên chưa lưu; gửi kèm orderId để lưu đề xuất.',
        };
      }
      if (isClosed) {
        return {
          proposal: null,
          before,
          after,
          applied: false,
          note: 'Đơn đã đóng nên chưa lưu đề xuất; sửa địa chỉ qua luồng phê duyệt sửa đơn đã đóng.',
        };
      }
      const now = new Date().toISOString();
      const proposal: AddressProposal = {
        id: this.nextId(),
        orderId: order.id,
        status: 'Chờ duyệt',
        before,
        after,
        requestedBy: caller.username,
        requestedAt: now,
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
        appliedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.save(proposal);
      await this.appendAudit(
        caller,
        'address-proposal.created',
        order.id,
        formatAddress(beforeAddress),
        formatAddress(afterAddress),
        `Tin cậy ${beforeEval.trust} -> ${afterEval.trust}.`,
      );
      return { proposal, before, after, applied: false };
    }

    return {
      proposal: null,
      before,
      after,
      choices: suggestion.choices,
      applied: false,
      note: 'Độ tin cậy thấp, chưa có đề xuất áp dụng được; nhập tay theo danh sách phường đúng.',
    };
  }

  async getProposal(id: string): Promise<AddressProposal> {
    const proposal = await this.store.findById(id);
    if (!proposal) {
      throw new NotFoundException(`Không tìm thấy đề xuất ${id}.`);
    }
    return proposal;
  }

  async decide(
    caller: Caller,
    id: string,
    input: DecisionProposalInput,
  ): Promise<AddressProposal> {
    const proposal = await this.store.findById(id);
    if (!proposal) {
      throw new NotFoundException(`Không tìm thấy đề xuất ${id}.`);
    }
    if (proposal.status !== 'Chờ duyệt') {
      throw new ConflictException(
        `Đề xuất ${id} đã được quyết định (${proposal.status}), không quyết định lại được.`,
      );
    }

    if (input.decision === 'rejected') {
      if (!input.reason || !input.reason.trim()) {
        throw new BadRequestException('Từ chối đề xuất cần ghi rõ lý do.');
      }
      const now = new Date().toISOString();
      proposal.status = 'Đã từ chối';
      proposal.decidedBy = caller.username;
      proposal.decidedAt = now;
      proposal.decisionReason = input.reason.trim();
      proposal.updatedAt = now;
      await this.store.update(proposal);
      await this.appendAudit(
        caller,
        'address-proposal.rejected',
        proposal.orderId,
        formatAddress(proposal.before.address),
        formatAddress(proposal.after.address),
        `Lý do: ${proposal.decisionReason}`,
      );
      return proposal;
    }

    const order = await this.orders.findOne(proposal.orderId);
    if (CLOSED_STATES.includes(order.state)) {
      throw new ConflictException(
        `Đơn ${proposal.orderId} đã đóng (${order.state}), không áp dụng được qua đề xuất; sửa địa chỉ qua luồng phê duyệt sửa đơn đã đóng.`,
      );
    }
    // Người duyệt được sửa địa chỉ trong modal; địa chỉ cuối cùng được
    // chấm lại và ghi vào đề xuất, người duyệt chịu trách nhiệm về lựa
    // chọn này (kể cả khi điểm cuối thấp hơn đề xuất gốc).
    const addressToApply: AddressInput = input.address ?? proposal.after.address;
    const finalEval = this.addressService.evaluate(addressToApply);
    await this.orders.update(
      proposal.orderId,
      { address: addressToApply },
      caller,
    );
    const now = new Date().toISOString();
    proposal.status = 'Đã áp dụng';
    proposal.after = {
      address: addressToApply,
      trust: finalEval.trust,
      level: finalEval.level,
      reasons: proposal.after.reasons,
    };
    proposal.decidedBy = caller.username;
    proposal.decidedAt = now;
    proposal.decisionReason =
      input.reason && input.reason.trim() ? input.reason.trim() : null;
    proposal.appliedAt = now;
    proposal.updatedAt = now;
    await this.store.update(proposal);
    await this.appendAudit(
      caller,
      'address-proposal.applied',
      proposal.orderId,
      formatAddress(proposal.before.address),
      formatAddress(addressToApply),
      `Tin cậy ${proposal.before.trust} -> ${finalEval.trust}.`,
    );
    return proposal;
  }

  private nextId(): string {
    return `AC-${String(this.nextNumber++).padStart(4, '0')}`;
  }

  private async appendAudit(
    caller: Caller,
    action: string,
    orderId: string,
    from: string,
    to: string,
    detail: string,
  ): Promise<void> {
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action,
      orderId,
      from,
      to,
      detail,
    });
  }
}

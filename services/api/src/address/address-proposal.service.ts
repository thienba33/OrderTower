// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { CLOSED_STATES, OrdersService } from '../orders/orders.service';
import { AddressService, MIN_ADDRESS_TRUST } from './address.service';
import { AddressLlmService } from './address-llm.service';
import { normalizeForMatch } from './address.suggest';
import {
  ADDRESS_PROPOSAL_STORE,
} from './address-proposal.store';
import {
  AddressInput,
  AddressParts,
  AddressProposal,
  AddressProposalStore,
  AddressSnapshot,
  DecisionProposalInput,
  LlmParsedAddress,
  SuggestInput,
  SuggestResponse,
  SuggestedAddress,
  SuggestionSource,
} from './address.types';

function formatAddress(address: AddressInput): string {
  const parts = [address.province, address.district, address.ward, address.street].filter(
    (part) => part && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' / ') : '(trống)';
}

// Nối các phần địa chỉ đã có thành chuỗi để LLM phân tích: đường trước,
// tỉnh sau, giống cách ghi địa chỉ thường dùng. Quận/huyện cũ giữ lại
// trong chuỗi vì giúp LLM phân biệt phường cũ (ví dụ Hoàn Kiếm).
function joinAddressParts(address: AddressInput): string {
  return [address.street, address.ward, address.district, address.province]
    .filter((part) => part && part.trim().length > 0)
    .join(', ');
}

// Đề xuất chuẩn hóa địa chỉ + duyệt áp dụng (AI số 1, xem bản dự thảo
// du-thao-ai-chuan-hoa-dia-chi.md mục 4-5). Luồng gợi ý (LLM lai):
//   - Luật trước: tính đề xuất luật ngay từ đầu; nếu luật đã xác định
//     được đầy đủ (tin cậy >= 95) thì dùng luật, không gọi LLM. LLM có
//     thể sửa 1 địa chỉ luật đã đúng thành phường khác cũng đúng trong
//     cùng tỉnh (ví dụ "p. HK" luật tra chữ cái đầu ra Hoàn Kiếm, LLM
//     đoán thành Hai Bà Trưng), nên không gọi LLM khi luật đã đủ tin cậy.
//   - LLM (Workers AI) chỉ chạy khi luật chưa đủ tin cậy: phân tích
//     chuỗi thành {province, ward, street}, rồi đối chiếu với dữ liệu
//     hành chính trước khi nhận: tỉnh LLM trả phải khớp tỉnh đã ghi rõ
//     trong chuỗi (nếu có); tỉnh do LLM đoán chỉ được nhận khi phường
//     buộc ra đúng 1 tỉnh trong danh mục; luật kiểm lại phường chỉ nhận
//     khi khớp chính xác, không khớp mờ. Không qua được cổng nào thì bỏ
//     gợi ý LLM, dùng luật;
//   - không có cấu hình LLM, LLM lỗi, hoặc địa chỉ đã đạt mức cao thì
//     dùng luật (không gọi LLM);
//   - mức cao (tin cậy 100): tự áp dụng vào đơn qua đường sửa đơn có sẵn
//     (OrdersService.update, không có đường ghi thứ hai), ghi đề xuất
//     "Tự áp dụng" + audit address-proposal.auto-applied;
//   - mức giữa (80): lưu đề xuất "Chờ duyệt" cho modal duyệt tay +
//     audit address-proposal.created;
//   - mức thấp (<= 60): KHÔNG có đề xuất áp dụng được, trả lý do từng
//     phần + danh sách phường đúng để nhập tay. Khi địa chỉ không xác
//     định được an toàn từ dữ liệu hành chính (phường ghi rõ mà không có
//     trong tỉnh, tỉnh không tra được, phường mơ hồ), trả thêm
//     splitError để màn hình đưa đơn vào phần Lỗi phân tách cho người
//     dùng tự hiệu chỉnh; hệ thống không đoán hay sửa thành vị trí khác.
// Đề xuất từ LLM ghi thêm audit address-proposal.llm-suggested. Đề xuất
// đã quyết định thì quyết định lại = 409. Từ chối bắt buộc có lý do. Đơn
// đã đóng không tự áp dụng/lưu đề xuất được (sửa đơn đã đóng cần phê
// duyệt riêng, xem OrdersService.update).
@Injectable()
export class AddressProposalService implements OnModuleInit {
  private readonly logger = new Logger(AddressProposalService.name);
  private nextNumber = 1001;

  constructor(
    @Inject(ADDRESS_PROPOSAL_STORE)
    private readonly store: AddressProposalStore,
    private readonly addressService: AddressService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    @Optional() private readonly llm?: AddressLlmService,
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

    // Địa chỉ trước (ảnh chụp trước khi chuẩn hóa) + chuỗi đưa cho LLM.
    // raw thắng khi gửi kèm orderId (chuỗi dán vào là địa chỉ cần chuẩn
    // hóa); address thắng khi gửi kèm orderId; không có cả hai thì lấy
    // địa chỉ đã lưu của đơn. Chuỗi thô dán vào dùng nguyên văn; địa chỉ
    // đã có thì nối các phần lại thành chuỗi để LLM sửa lỗi gõ / tên
    // phường cũ trong địa chỉ đã lưu.
    let beforeAddress: AddressInput;
    let rawParts: AddressParts | null = null;
    let llmText = '';
    if (hasRaw) {
      const split = this.addressService.splitRaw(input.raw!);
      rawParts = split.parts;
      beforeAddress = {
        province: split.parts.province,
        ward: split.parts.ward,
        district: split.parts.district,
        street: split.parts.street,
      };
      llmText = input.raw!.trim();
    } else if (hasAddress) {
      beforeAddress = input.address!;
      llmText = joinAddressParts(beforeAddress);
    } else {
      beforeAddress = order!.address ?? {};
      llmText = joinAddressParts(beforeAddress);
    }

    const beforeEval = this.addressService.evaluate(beforeAddress);

    // Đề xuất theo luật (đường lui; cũng dùng để ghi lý do khi địa chỉ
    // đã đạt mức cao).
    const rulesSuggestion = (): SuggestedAddress => {
      if (hasRaw) {
        return this.addressService.suggestFromParts({
          province: rawParts!.province,
          ward: rawParts!.ward,
          district: rawParts!.district,
          street: rawParts!.street,
        });
      }
      if (hasAddress) {
        return this.addressService.suggestFromAddress(input.address!);
      }
      return this.addressService.suggestFromParts({
        province: beforeAddress.province,
        ward: beforeAddress.ward,
        district: beforeAddress.district,
        street: beforeAddress.street ?? '',
      });
    };

    // Luật trước: tính đề xuất luật ngay từ đầu. Nếu luật đã xác định
    // được đầy đủ (tin cậy >= 95) thì dùng luật, không gọi LLM: LLM có
    // thể sửa 1 địa chỉ luật đã đúng thành phường khác cũng đúng trong
    // cùng tỉnh (ví dụ "p. HK" luật tra chữ cái đầu ra Hoàn Kiếm, LLM
    // đoán thành Hai Bà Trưng). Chỉ khi luật chưa đủ tin cậy mới gọi
    // LLM, và gợi ý LLM vẫn phải qua các cổng đối chiếu bên dưới.
    // Địa chỉ đã đạt mức cao thì không gọi LLM: không còn gì để gợi ý,
    // và LLM có thể sửa 1 địa chỉ đã đúng thành phường khác cũng đúng.
    const rulesFirst = rulesSuggestion();
    const rulesFirstTrust = this.addressService.evaluate({
      province: rulesFirst.province,
      ward: rulesFirst.ward,
      street: rulesFirst.street,
    }).trust;
    let suggestion: SuggestedAddress | null = null;
    let source: SuggestionSource = 'rules';
    // Tỉnh đã ghi rõ trong chuỗi (từ tách chuỗi khi có raw, hoặc từ địa
    // chỉ có cấu trúc/đã lưu khi không có raw); dùng làm mốc đối chiếu
    // tỉnh LLM trả. Không có tỉnh rõ ràng thì tỉnh LLM phải được dữ liệu
    // hành chính buộc ra (xem kiểm tra grounding bên dưới).
    const explicitProvince = hasRaw
      ? rawParts?.province
      : beforeAddress.province;
    if (rulesFirstTrust >= 95) {
      suggestion = rulesFirst;
    } else if (beforeEval.trust < 95 && this.llm?.enabled && llmText) {
      let parsed: LlmParsedAddress | null = null;
      try {
        parsed = await this.llm.parseAddress(llmText);
      } catch (error) {
        this.logger.warn(
          `LLM chuẩn hóa địa chỉ lỗi, dùng luật: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (parsed) {
        // (1) Tỉnh LLM trả phải khớp tỉnh đã ghi rõ trong chuỗi (sau
        // chuẩn hóa). Tỉnh khác nghĩa là LLM đọc sai/gõ lỗi (ví dụ "Hề
        // Nôi" thay vì "Hà Nội"); lỗi gõ ở tỉnh luật đã xử lý bằng khớp
        // mờ nên bỏ gợi ý LLM không mất gì.
        if (
          parsed.province &&
          explicitProvince &&
          normalizeForMatch(parsed.province) !==
            normalizeForMatch(explicitProvince)
        ) {
          this.logger.warn(
            `LLM trả tỉnh "${parsed.province}" khác tỉnh đã ghi "${explicitProvince}", dùng luật.`,
          );
          parsed = null;
        }
        // (2) Chuỗi không ghi tỉnh mà LLM đoán tỉnh: chỉ nhận khi phường
        // LLM trả chỉ có ở đúng 1 tỉnh trong danh mục và tỉnh đó đúng là
        // tỉnh LLM trả (dữ liệu hành chính buộc ra tỉnh, không phải đoán).
        // Phường có ở nhiều tỉnh thì tỉnh LLM là phỏng đoán, bỏ, dùng luật.
        if (
          parsed &&
          !explicitProvince &&
          parsed.province &&
          parsed.ward
        ) {
          const provinces = this.addressService.findProvincesByWard(
            parsed.ward,
          );
          const grounded =
            provinces.length === 1 &&
            normalizeForMatch(provinces[0].name) ===
              normalizeForMatch(parsed.province);
          if (!grounded) {
            this.logger.warn(
              `LLM đoán tỉnh "${parsed.province}" cho phường "${parsed.ward}" không đối chiếu được với danh mục, dùng luật.`,
            );
            parsed = null;
          }
        }
      }
      if (parsed) {
        const validated = this.addressService.suggestFromParts({
          province: parsed.province || undefined,
          ward: parsed.ward || undefined,
          street: parsed.street ?? '',
        });
        if (validated.wardKnown && !validated.fuzzy) {
          validated.reasons.unshift(
            'Gợi ý từ LLM, đã kiểm lại phường với danh mục.',
          );
          suggestion = validated;
          source = 'llm';
        } else if (validated.wardKnown) {
          // Luật phải khớp mờ mới ra phường: LLM đã tự sửa lỗi gõ nên
          // khớp mờ thêm 1 lớp nữa sẽ biến tên bịa thành phường thật khác
          // (ví dụ "Hồng Kông" thành "Hồng Sơn"); bỏ, dùng luật.
          this.logger.warn(
            `LLM trả phường "${parsed.ward}" chỉ khớp mờ với danh mục, dùng luật.`,
          );
        } else {
          this.logger.warn(
            `LLM trả phường không có trong danh mục (${parsed.ward ?? '(trống)'}), dùng luật.`,
          );
        }
      }
    }
    if (suggestion === null) {
      suggestion = rulesFirst;
    }
    // Lỗi phân tách (nếu có) từ đề xuất cuối cùng: màn hình đưa đơn vào
    // phần Lỗi phân tách để người dùng tự hiệu chỉnh, không tự áp dụng.
    const splitError = suggestion.splitError;

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
        source,
        applied: false,
        splitError,
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
          source,
          applied: false,
          splitError,
          note: 'Đề xuất đạt độ tin cậy cao nhưng không kèm đơn nên chưa áp dụng; gửi kèm orderId để tự áp dụng.',
        };
      }
      if (isClosed) {
        return {
          proposal: null,
          before,
          after,
          source,
          applied: false,
          splitError,
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
        source,
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
      if (source === 'llm') {
        await this.appendAudit(
          caller,
          'address-proposal.llm-suggested',
          order.id,
          formatAddress(beforeAddress),
          formatAddress(afterAddress),
          `Tin cậy ${beforeEval.trust} -> ${afterEval.trust}; nguồn LLM.`,
        );
      }
      return { proposal, before, after, source, applied: true, splitError };
    }

    if (afterEval.trust >= MIN_ADDRESS_TRUST) {
      if (!order) {
        return {
          proposal: null,
          before,
          after,
          source,
          applied: false,
          splitError,
          note: 'Đề xuất cần duyệt nhưng không kèm đơn nên chưa lưu; gửi kèm orderId để lưu đề xuất.',
        };
      }
      if (isClosed) {
        return {
          proposal: null,
          before,
          after,
          source,
          applied: false,
          splitError,
          note: 'Đơn đã đóng nên chưa lưu đề xuất; sửa địa chỉ qua luồng phê duyệt sửa đơn đã đóng.',
        };
      }
      const now = new Date().toISOString();
      const proposal: AddressProposal = {
        id: this.nextId(),
        orderId: order.id,
        status: 'Chờ duyệt',
        source,
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
      if (source === 'llm') {
        await this.appendAudit(
          caller,
          'address-proposal.llm-suggested',
          order.id,
          formatAddress(beforeAddress),
          formatAddress(afterAddress),
          `Tin cậy ${beforeEval.trust} -> ${afterEval.trust}; nguồn LLM.`,
        );
      }
      return { proposal, before, after, source, applied: false, splitError };
    }

    return {
      proposal: null,
      before,
      after,
      choices: suggestion.choices,
      source,
      applied: false,
      splitError,
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

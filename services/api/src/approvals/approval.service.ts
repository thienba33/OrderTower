// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import type {
  Approval,
  ApprovalStatus,
  ApprovalStore,
  RequestApprovalInput,
} from './approval.types';
import { APPROVAL_STORE } from './approval.store';

// Vai được duyệt: 5 điểm duyệt bắt buộc trong kế hoạch đều là quyết định
// ảnh hưởng khách hàng hoặc tiền, nên chỉ Quản lý và Quản trị viên duyệt.
export const APPROVER_ROLES = ['Quản lý', 'Quản trị viên'];

function copyApproval(approval: Approval): Approval {
  return JSON.parse(JSON.stringify(approval)) as Approval;
}

// Quản lý vòng đời phê duyệt: yêu cầu -> duyệt/từ chối -> áp dụng 1 lần.
// Người duyệt khác người xin (tách nhiệm), vai duyệt phải thuộc
// APPROVER_ROLES, mọi bước đều ghi audit với người thật lấy từ token.
@Injectable()
export class ApprovalService implements OnModuleInit {
  private nextNumber = 1001;

  constructor(
    private readonly audit: AuditService,
    @Inject(APPROVAL_STORE)
    private readonly store: ApprovalStore,
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có AP-1001 thì yêu cầu mới là AP-1002,
  // không quay về AP-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const approvals = await this.store.list();
    this.nextNumber = computeNextNumber(
      approvals.map((approval) => approval.id),
      'AP',
    );
  }

  async request(
    input: RequestApprovalInput,
    caller: Caller,
  ): Promise<Approval> {
    if (typeof input.type !== 'string' || input.type.trim() === '') {
      throw new BadRequestException('type là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.subjectId !== 'string' || input.subjectId.trim() === '') {
      throw new BadRequestException('subjectId là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.reason !== 'string' || input.reason.trim() === '') {
      throw new BadRequestException('Yêu cầu phê duyệt cần có lý do.');
    }
    const now = new Date().toISOString();
    const approval: Approval = {
      id: `AP-${String(this.nextNumber++).padStart(4, '0')}`,
      type: input.type,
      subjectId: input.subjectId,
      reason: input.reason,
      requestedBy: caller.username,
      requestedAt: now,
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      appliedAt: null,
    };
    await this.store.save(approval);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'approval.requested',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: input.subjectId,
      from: null,
      to: 'pending',
      detail: `${input.type}: ${input.reason}`,
    });
    return copyApproval(approval);
  }

  async get(id: string): Promise<Approval> {
    const approval = await this.store.findById(id);
    if (!approval) {
      throw new NotFoundException(`Không tìm thấy phê duyệt ${id}.`);
    }
    return approval;
  }

  async list(filters: {
    type?: string;
    subjectId?: string;
    status?: ApprovalStatus;
    requestedBy?: string;
  }): Promise<Approval[]> {
    const approvals = await this.store.list();
    return approvals.filter(
      (approval) =>
        (filters.type === undefined || approval.type === filters.type) &&
        (filters.subjectId === undefined ||
          approval.subjectId === filters.subjectId) &&
        (filters.status === undefined ||
          approval.status === filters.status) &&
        (filters.requestedBy === undefined ||
          approval.requestedBy === filters.requestedBy),
    );
  }

  async approve(
    id: string,
    caller: Caller,
    reason?: string,
  ): Promise<Approval> {
    return this.decide(id, caller, 'approved', reason);
  }

  async reject(
    id: string,
    caller: Caller,
    reason: string,
  ): Promise<Approval> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Từ chối phê duyệt cần có lý do.');
    }
    return this.decide(id, caller, 'rejected', reason);
  }

  // Đánh dấu phê duyệt đã duyệt là đã dùng. Chỉ dùng 1 lần; đơn nghiệp vụ
  // gọi bước này sau khi đã kiểm tra type/subject khớp với việc của mình.
  async markApplied(id: string, caller: Caller): Promise<Approval> {
    const approval = await this.get(id);
    if (approval.status !== 'approved') {
      throw new ConflictException(
        `Phê duyệt ${id} đang ở trạng thái "${approval.status}", không áp dụng được.`,
      );
    }
    if (approval.appliedAt !== null) {
      throw new ConflictException(`Phê duyệt ${id} đã được dùng.`);
    }
    const now = new Date().toISOString();
    approval.appliedAt = now;
    await this.store.save(approval);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'approval.applied',
      orderId: approval.subjectId,
      from: 'approved',
      to: 'applied',
      detail: `${approval.type}.`,
    });
    return copyApproval(approval);
  }

  private async decide(
    id: string,
    caller: Caller,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<Approval> {
    const approval = await this.get(id);
    if (approval.status !== 'pending') {
      throw new ConflictException(
        `Phê duyệt ${id} đã được quyết (trạng thái "${approval.status}").`,
      );
    }
    if (caller.username === approval.requestedBy) {
      throw new ConflictException(
        'Người xin phê duyệt không được tự duyệt yêu cầu của mình.',
      );
    }
    if (!caller.roles.some((role) => APPROVER_ROLES.includes(role))) {
      throw new ConflictException(
        `Duyệt phê duyệt cần vai Quản lý hoặc Quản trị viên.`,
      );
    }
    if (reason !== undefined && typeof reason !== 'string') {
      throw new BadRequestException('reason phải là dạng chuỗi khi có.');
    }
    const now = new Date().toISOString();
    approval.status = status;
    approval.decidedBy = caller.username;
    approval.decidedAt = now;
    approval.decisionReason = reason ?? null;
    await this.store.save(approval);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: status === 'approved' ? 'approval.approved' : 'approval.rejected',
      orderId: approval.subjectId,
      from: 'pending',
      to: status,
      detail: reason ?? '',
    });
    return copyApproval(approval);
  }
}

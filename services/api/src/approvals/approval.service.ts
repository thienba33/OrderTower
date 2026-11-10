// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
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
export class ApprovalService {
  private nextNumber = 1001;

  constructor(
    private readonly audit: AuditService,
    @Inject(APPROVAL_STORE)
    private readonly store: ApprovalStore,
  ) {}

  request(input: RequestApprovalInput, caller: Caller): Approval {
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
    this.store.save(approval);
    this.audit.append({
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

  get(id: string): Approval {
    const approval = this.store.findById(id);
    if (!approval) {
      throw new NotFoundException(`Không tìm thấy phê duyệt ${id}.`);
    }
    return approval;
  }

  list(filters: {
    type?: string;
    subjectId?: string;
    status?: ApprovalStatus;
    requestedBy?: string;
  }): Approval[] {
    return this.store.list().filter(
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

  approve(id: string, caller: Caller, reason?: string): Approval {
    return this.decide(id, caller, 'approved', reason);
  }

  reject(id: string, caller: Caller, reason: string): Approval {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Từ chối phê duyệt cần có lý do.');
    }
    return this.decide(id, caller, 'rejected', reason);
  }

  // Đánh dấu phê duyệt đã duyệt là đã dùng. Chỉ dùng 1 lần; đơn nghiệp vụ
  // gọi bước này sau khi đã kiểm tra type/subject khớp với việc của mình.
  markApplied(id: string, caller: Caller): Approval {
    const approval = this.get(id);
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
    this.store.save(approval);
    this.audit.append({
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

  private decide(
    id: string,
    caller: Caller,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Approval {
    const approval = this.get(id);
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
    this.store.save(approval);
    this.audit.append({
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

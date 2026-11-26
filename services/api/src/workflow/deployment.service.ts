// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalService } from '../approvals/approval.service';
import type { Approval } from '../approvals/approval.types';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import type {
  WorkflowActivationResult,
  WorkflowVersionInfo,
} from './deployment.types';
import { WORKFLOW_DEPLOYMENT_APPROVAL_TYPE } from './deployment.types';
import {
  WORKFLOW_VERSION_STORE,
  type WorkflowVersionStore,
} from './version.store';
import { WorkflowService } from './workflow.service';

function subjectId(definitionId: string, version: string): string {
  return `${definitionId}@${version}`;
}

@Injectable()
export class WorkflowDeploymentService {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    @Inject(WORKFLOW_VERSION_STORE)
    private readonly versionStore: WorkflowVersionStore,
  ) {}

  listVersions(definitionId: string): WorkflowVersionInfo {
    return {
      definitionId,
      activeVersion: this.workflow.getActiveVersion(definitionId),
      versions: this.workflow.listVersions(definitionId),
    };
  }

  async requestDeployment(
    definitionId: string,
    version: string,
    reason: string,
    caller: Caller,
  ): Promise<Approval> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Yêu cầu deploy cần có lý do.');
    }
    const versions = this.workflow.listVersions(definitionId);
    if (!versions.includes(version)) {
      throw new NotFoundException(
        `Không tìm thấy version "${version}" của định nghĩa "${definitionId}". Các version hiện có: ${versions.join(', ')}.`,
      );
    }
    if (this.workflow.getActiveVersion(definitionId) === version) {
      throw new ConflictException(`Version "${version}" đang là bản active.`);
    }
    const subject = subjectId(definitionId, version);
    const pending = await this.approvals.list({
      type: WORKFLOW_DEPLOYMENT_APPROVAL_TYPE,
      subjectId: subject,
      status: 'pending',
    });
    if (pending.length > 0) {
      throw new ConflictException(
        `Đã có yêu cầu deploy đang chờ duyệt cho ${subject}.`,
      );
    }
    return this.approvals.request(
      {
        type: WORKFLOW_DEPLOYMENT_APPROVAL_TYPE,
        subjectId: subject,
        reason: reason.trim(),
      },
      caller,
    );
  }

  async activate(
    definitionId: string,
    version: string,
    approvalId: string,
    caller: Caller,
  ): Promise<WorkflowActivationResult> {
    const versions = this.workflow.listVersions(definitionId);
    if (!versions.includes(version)) {
      throw new NotFoundException(
        `Không tìm thấy version "${version}" của định nghĩa "${definitionId}".`,
      );
    }
    const expectedSubject = subjectId(definitionId, version);
    const previousVersion = this.workflow.getActiveVersion(definitionId);
    const approval = await this.approvals.get(approvalId);
    if (
      approval.type !== WORKFLOW_DEPLOYMENT_APPROVAL_TYPE ||
      approval.subjectId !== expectedSubject
    ) {
      throw new ConflictException(
        `Phê duyệt ${approvalId} không phải yêu cầu deploy ${expectedSubject}.`,
      );
    }
    if (approval.status !== 'approved') {
      throw new ConflictException(
        `Phê duyệt ${approvalId} đang ở trạng thái "${approval.status}", chưa thể activate.`,
      );
    }
    if (approval.appliedAt !== null) {
      throw new ConflictException(`Phê duyệt ${approvalId} đã được dùng.`);
    }

    await this.versionStore.setActiveVersion(
      definitionId,
      version,
      caller.username,
    );
    this.workflow.setActiveVersion(definitionId, version);
    await this.approvals.markApplied(approvalId, caller);
    const activatedAt = new Date().toISOString();
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'workflow.definition.activated',
      orderId: definitionId,
      from: previousVersion,
      to: version,
      detail: `Deploy ${expectedSubject} bằng phê duyệt ${approvalId}.`,
    });
    return {
      definitionId,
      version,
      approvalId,
      activatedBy: caller.username,
      activatedAt,
    };
  }
}

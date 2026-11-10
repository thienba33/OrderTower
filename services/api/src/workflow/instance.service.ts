// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type {
  StartInstanceInput,
  TransitionInstanceInput,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowInstanceStore,
} from './instance.types';
import { WORKFLOW_INSTANCE_STORE } from './instance.store';
import { WorkflowService } from './workflow.service';

function copyInstance(instance: WorkflowInstance): WorkflowInstance {
  return JSON.parse(JSON.stringify(instance)) as WorkflowInstance;
}

function requireActorRole(actor: unknown, role: unknown): void {
  if (typeof actor !== 'string' || actor.trim() === '') {
    throw new BadRequestException('actor là bắt buộc, dạng chuỗi.');
  }
  if (typeof role !== 'string' || role.trim() === '') {
    throw new BadRequestException('role là bắt buộc, dạng chuỗi.');
  }
}

// Quản lý vòng đời instance: bắt đầu, chuyển trạng thái, tạm dừng, tiếp tục,
// kết thúc. Mọi sự kiện đều ghi audit. Trạng thái luồng chỉ đổi qua đây,
// không ai được sửa trực tiếp currentState từ bên ngoài.
@Injectable()
export class WorkflowInstanceService {
  private nextNumber = 1001;

  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    @Inject(WORKFLOW_INSTANCE_STORE)
    private readonly store: WorkflowInstanceStore,
  ) {}

  start(input: StartInstanceInput): WorkflowInstance {
    if (typeof input.definitionId !== 'string' || input.definitionId.trim() === '') {
      throw new BadRequestException('definitionId là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.businessKey !== 'string' || input.businessKey.trim() === '') {
      throw new BadRequestException('businessKey là bắt buộc, dạng chuỗi.');
    }
    requireActorRole(input.actor, input.role);
    if (
      input.context !== undefined &&
      (typeof input.context !== 'object' ||
        input.context === null ||
        Array.isArray(input.context))
    ) {
      throw new BadRequestException('context phải là 1 object khi có.');
    }
    const definition = this.workflow.getDefinition(input.definitionId);
    if (
      this.store.findByBusinessKey(input.definitionId, input.businessKey)
    ) {
      throw new ConflictException(
        `Đã có instance của luồng "${input.definitionId}" cho businessKey "${input.businessKey}".`,
      );
    }
    const now = new Date().toISOString();
    const initialState = this.workflow.getInitialState(input.definitionId);
    const instance: WorkflowInstance = {
      id: `WF-${String(this.nextNumber++).padStart(4, '0')}`,
      definitionId: definition.definitionId,
      definitionVersion: definition.version,
      businessKey: input.businessKey,
      currentState: initialState,
      status: 'active',
      context: input.context ? { ...input.context } : {},
      history: [
        {
          from: null,
          to: initialState,
          by: input.actor,
          role: input.role,
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(instance);
    this.audit.append({
      actor: input.actor,
      role: input.role,
      action: 'workflow.instance.started',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: input.businessKey,
      from: null,
      to: initialState,
      detail: `Luồng ${definition.definitionId} v${definition.version}.`,
    });
    return copyInstance(instance);
  }

  get(id: string): WorkflowInstance {
    const instance = this.store.findById(id);
    if (!instance) {
      throw new NotFoundException(`Không tìm thấy workflow instance ${id}.`);
    }
    return instance;
  }

  findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): WorkflowInstance | null {
    return this.store.findByBusinessKey(definitionId, businessKey);
  }

  list(filters: {
    definitionId?: string;
    businessKey?: string;
    status?: WorkflowInstanceStatus;
  }): WorkflowInstance[] {
    return this.store.list().filter(
      (instance) =>
        (filters.definitionId === undefined ||
          instance.definitionId === filters.definitionId) &&
        (filters.businessKey === undefined ||
          instance.businessKey === filters.businessKey) &&
        (filters.status === undefined || instance.status === filters.status),
    );
  }

  transition(id: string, input: TransitionInstanceInput): WorkflowInstance {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    requireActorRole(input.actor, input.role);
    const instance = this.get(id);
    const deny = (reason: string): never => {
      this.audit.append({
        actor: input.actor,
        role: input.role,
        action: 'workflow.instance.transition.denied',
        orderId: instance.businessKey,
        from: instance.currentState,
        to: input.to,
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    if (instance.status !== 'active') {
      deny(
        `Instance ${id} đang ở trạng thái "${instance.status}", không chuyển được.`,
      );
    }
    const check = this.workflow.canTransition(
      instance.definitionId,
      instance.currentState,
      input.to,
      input.role,
    );
    if (!check.allowed) {
      deny(check.reason ?? 'Chuyển trạng thái không được phép.');
    }
    const now = new Date().toISOString();
    const from = instance.currentState;
    instance.currentState = input.to;
    instance.updatedAt = now;
    if (this.workflow.isTerminalState(instance.definitionId, input.to)) {
      instance.status = 'completed';
    }
    instance.history.push({
      from,
      to: input.to,
      by: input.actor,
      role: input.role,
      at: now,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.handling ? { handling: input.handling } : {}),
    });
    const detailParts: string[] = [];
    if (input.handling) {
      detailParts.push(`Hướng xử lý: ${input.handling}`);
    }
    if (input.reason) {
      detailParts.push(`Lý do: ${input.reason}`);
    }
    this.audit.append({
      actor: input.actor,
      role: input.role,
      action: 'workflow.instance.transition',
      orderId: instance.businessKey,
      from,
      to: input.to,
      detail: detailParts.join('; '),
    });
    this.store.save(instance);
    return copyInstance(instance);
  }

  suspend(
    id: string,
    actor: string,
    role: string,
    reason?: string,
  ): WorkflowInstance {
    requireActorRole(actor, role);
    if (reason !== undefined && typeof reason !== 'string') {
      throw new BadRequestException('reason phải là dạng chuỗi khi có.');
    }
    const instance = this.get(id);
    if (instance.status !== 'active') {
      throw new ConflictException(
        `Instance ${id} đang ở trạng thái "${instance.status}", không tạm dừng được.`,
      );
    }
    const now = new Date().toISOString();
    instance.status = 'suspended';
    instance.updatedAt = now;
    instance.history.push({
      from: instance.currentState,
      to: instance.currentState,
      by: actor,
      role,
      at: now,
      ...(reason ? { reason } : {}),
    });
    this.audit.append({
      actor,
      role,
      action: 'workflow.instance.suspended',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: reason ?? '',
    });
    this.store.save(instance);
    return copyInstance(instance);
  }

  resume(id: string, actor: string, role: string): WorkflowInstance {
    requireActorRole(actor, role);
    const instance = this.get(id);
    if (instance.status !== 'suspended') {
      throw new ConflictException(
        `Instance ${id} đang ở trạng thái "${instance.status}", không tiếp tục được.`,
      );
    }
    const now = new Date().toISOString();
    instance.status = 'active';
    instance.updatedAt = now;
    instance.history.push({
      from: instance.currentState,
      to: instance.currentState,
      by: actor,
      role,
      at: now,
    });
    this.audit.append({
      actor,
      role,
      action: 'workflow.instance.resumed',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: '',
    });
    this.store.save(instance);
    return copyInstance(instance);
  }

  terminate(
    id: string,
    actor: string,
    role: string,
    reason: string,
  ): WorkflowInstance {
    requireActorRole(actor, role);
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Kết thúc instance cần có lý do.');
    }
    const instance = this.get(id);
    if (instance.status !== 'active' && instance.status !== 'suspended') {
      throw new ConflictException(
        `Instance ${id} đang ở trạng thái "${instance.status}", không kết thúc được.`,
      );
    }
    const now = new Date().toISOString();
    instance.status = 'terminated';
    instance.updatedAt = now;
    instance.history.push({
      from: instance.currentState,
      to: instance.currentState,
      by: actor,
      role,
      at: now,
      reason,
    });
    this.audit.append({
      actor,
      role,
      action: 'workflow.instance.terminated',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: `Lý do: ${reason}`,
    });
    this.store.save(instance);
    return copyInstance(instance);
  }
}

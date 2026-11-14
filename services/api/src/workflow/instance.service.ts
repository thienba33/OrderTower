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

// Quản lý vòng đời instance: bắt đầu, chuyển trạng thái, tạm dừng, tiếp tục,
// kết thúc. Mọi sự kiện đều ghi audit. Trạng thái luồng chỉ đổi qua đây,
// không ai được sửa trực tiếp currentState từ bên ngoài. Người gọi (caller)
// lấy từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class WorkflowInstanceService implements OnModuleInit {
  private nextNumber = 1001;

  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    @Inject(WORKFLOW_INSTANCE_STORE)
    private readonly store: WorkflowInstanceStore,
  ) {}

  // Tiếp tục số thứ tự từ kho: instance đã có WF-1001 thì instance mới là
  // WF-1002, không quay về WF-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const instances = await this.store.list();
    this.nextNumber = computeNextNumber(
      instances.map((instance) => instance.id),
      'WF',
    );
  }

  async start(
    input: StartInstanceInput,
    caller: Caller,
  ): Promise<WorkflowInstance> {
    if (typeof input.definitionId !== 'string' || input.definitionId.trim() === '') {
      throw new BadRequestException('definitionId là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.businessKey !== 'string' || input.businessKey.trim() === '') {
      throw new BadRequestException('businessKey là bắt buộc, dạng chuỗi.');
    }
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
      await this.store.findByBusinessKey(input.definitionId, input.businessKey)
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
          by: caller.username,
          role: caller.roles[0] ?? '',
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(instance);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'workflow.instance.started',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: input.businessKey,
      from: null,
      to: initialState,
      detail: `Luồng ${definition.definitionId} v${definition.version}.`,
    });
    return copyInstance(instance);
  }

  async get(id: string): Promise<WorkflowInstance> {
    const instance = await this.store.findById(id);
    if (!instance) {
      throw new NotFoundException(`Không tìm thấy workflow instance ${id}.`);
    }
    return instance;
  }

  async findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): Promise<WorkflowInstance | null> {
    return this.store.findByBusinessKey(definitionId, businessKey);
  }

  async list(filters: {
    definitionId?: string;
    businessKey?: string;
    status?: WorkflowInstanceStatus;
  }): Promise<WorkflowInstance[]> {
    const instances = await this.store.list();
    return instances.filter(
      (instance) =>
        (filters.definitionId === undefined ||
          instance.definitionId === filters.definitionId) &&
        (filters.businessKey === undefined ||
          instance.businessKey === filters.businessKey) &&
        (filters.status === undefined || instance.status === filters.status),
    );
  }

  // skipRoleCheck chỉ dùng cho chuyển đơn theo sự kiện shipment: vai đã
  // kiểm ở quy tắc shipment (điều xe cần Điều phối viên, giao hàng cần
  // Tài xế, giao thất bại cần 1 trong 2), còn chuyển đơn chỉ là hệ quả.
  // Endpoint chuyển instance trực tiếp không bao giờ bỏ kiểm tra vai.
  async transition(
    id: string,
    input: TransitionInstanceInput,
    caller: Caller,
    options?: { skipRoleCheck?: boolean },
  ): Promise<WorkflowInstance> {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    const instance = await this.get(id);
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'workflow.instance.transition.denied',
        orderId: instance.businessKey,
        from: instance.currentState,
        to: input.to,
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    if (instance.status !== 'active') {
      await deny(
        `Instance ${id} đang ở trạng thái "${instance.status}", không chuyển được.`,
      );
    }
    const check = this.workflow.canTransition(
      instance.definitionId,
      instance.currentState,
      input.to,
      options?.skipRoleCheck ? undefined : caller.roles,
    );
    if (!check.allowed) {
      await deny(check.reason ?? 'Chuyển trạng thái không được phép.');
    }
    const now = new Date().toISOString();
    const from = instance.currentState;
    // Vai ghi vào lịch sử là vai được phép chuyển theo định nghĩa.
    const role = check.requiredRole ?? caller.roles[0] ?? '';
    instance.currentState = input.to;
    instance.updatedAt = now;
    if (this.workflow.isTerminalState(instance.definitionId, input.to)) {
      instance.status = 'completed';
    }
    instance.history.push({
      from,
      to: input.to,
      by: caller.username,
      role,
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
    await this.audit.append({
      actor: caller.username,
      role,
      action: 'workflow.instance.transition',
      orderId: instance.businessKey,
      from,
      to: input.to,
      detail: detailParts.join('; '),
    });
    await this.store.save(instance);
    return copyInstance(instance);
  }

  async suspend(
    id: string,
    caller: Caller,
    reason?: string,
  ): Promise<WorkflowInstance> {
    if (reason !== undefined && typeof reason !== 'string') {
      throw new BadRequestException('reason phải là dạng chuỗi khi có.');
    }
    const instance = await this.get(id);
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
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
      ...(reason ? { reason } : {}),
    });
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'workflow.instance.suspended',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: reason ?? '',
    });
    await this.store.save(instance);
    return copyInstance(instance);
  }

  async resume(id: string, caller: Caller): Promise<WorkflowInstance> {
    const instance = await this.get(id);
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
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
    });
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'workflow.instance.resumed',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: '',
    });
    await this.store.save(instance);
    return copyInstance(instance);
  }

  async terminate(
    id: string,
    caller: Caller,
    reason: string,
  ): Promise<WorkflowInstance> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Kết thúc instance cần có lý do.');
    }
    const instance = await this.get(id);
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
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
      reason,
    });
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'workflow.instance.terminated',
      orderId: instance.businessKey,
      from: instance.currentState,
      to: instance.currentState,
      detail: `Lý do: ${reason}`,
    });
    await this.store.save(instance);
    return copyInstance(instance);
  }
}

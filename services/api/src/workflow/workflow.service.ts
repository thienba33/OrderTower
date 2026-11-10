// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  TransitionCheck,
  WorkflowDefinition,
  WorkflowTransition,
} from './workflow.types';

// Tên tệp định nghĩa mặc định. Phiên bản mới là tệp mới, không sửa tệp cũ.
const DEFAULT_DEFINITION_FILE = 'order-flow.v1.json';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);
  private definition: WorkflowDefinition | null = null;

  onModuleInit(): void {
    this.definition = this.loadDefinition();
    this.logger.log(
      `Đã nạp định nghĩa luồng ${this.definition.definitionId} v${this.definition.version} (${this.definition.states.length} trạng thái, ${this.definition.transitions.length} chuyển).`,
    );
  }

  // Đường dẫn tệp định nghĩa: biến môi trường thắng, mặc định nằm cạnh mã nguồn.
  resolveDefinitionPath(): string {
    if (process.env.WORKFLOW_DEFINITION_PATH) {
      return process.env.WORKFLOW_DEFINITION_PATH;
    }
    return join(__dirname, 'definitions', DEFAULT_DEFINITION_FILE);
  }

  getDefinition(): WorkflowDefinition {
    if (!this.definition) {
      throw new Error('Định nghĩa luồng chưa được nạp.');
    }
    return JSON.parse(JSON.stringify(this.definition)) as WorkflowDefinition;
  }

  getStates(): string[] {
    return [...this.getDefinition().states];
  }

  getTransitions(): WorkflowTransition[] {
    return JSON.parse(
      JSON.stringify(this.getDefinition().transitions),
    ) as WorkflowTransition[];
  }

  // Chỉ dựa vào tệp định nghĩa, không có điều kiện chuyển nào ghi trong code.
  canTransition(from: string, to: string, role?: string): TransitionCheck {
    const definition = this.getDefinition();
    const transition = definition.transitions.find(
      (item) => item.from === from && item.to === to,
    );
    if (!transition) {
      return {
        allowed: false,
        requiredRole: null,
        reason: `Chuyển từ "${from}" sang "${to}" không có trong định nghĩa ${definition.definitionId} v${definition.version}.`,
      };
    }
    if (role !== undefined && role !== transition.role) {
      return {
        allowed: false,
        requiredRole: transition.role,
        reason: `Chuyển này yêu cầu vai "${transition.role}", vai "${role}" không được phép.`,
      };
    }
    return { allowed: true, requiredRole: transition.role, reason: null };
  }

  private loadDefinition(): WorkflowDefinition {
    const path = this.resolveDefinitionPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp định nghĩa luồng tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp định nghĩa luồng tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return validateDefinition(parsed, path);
  }
}

// Kiểm tra hình dạng tệp định nghĩa, lỗi thì chặn khởi động để không chạy luồng sai.
function validateDefinition(
  parsed: unknown,
  path: string,
): WorkflowDefinition {
  const fail = (message: string): never => {
    throw new Error(`Tệp định nghĩa luồng tại ${path} không hợp lệ: ${message}`);
  };
  if (typeof parsed !== 'object' || parsed === null) {
    fail('nội dung phải là 1 object JSON.');
  }
  const value = parsed as Record<string, unknown>;
  if (!isNonEmptyString(value.definitionId)) {
    fail('thiếu definitionId dạng chuỗi.');
  }
  if (!isNonEmptyString(value.version)) {
    fail('thiếu version dạng chuỗi.');
  }
  if (!isStringArray(value.states) || value.states.length === 0) {
    fail('states phải là mảng chuỗi không rỗng.');
  }
  const states = value.states as string[];
  if (new Set(states).size !== states.length) {
    fail('states có trạng thái trùng nhau.');
  }
  if (!Array.isArray(value.transitions)) {
    fail('transitions phải là 1 mảng.');
  }
  const seen = new Set<string>();
  for (const item of value.transitions as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      fail('mỗi transition phải là 1 object.');
    }
    const transition = item as Record<string, unknown>;
    if (!isNonEmptyString(transition.from)) {
      fail('mỗi transition cần from dạng chuỗi.');
    }
    if (!isNonEmptyString(transition.to)) {
      fail('mỗi transition cần to dạng chuỗi.');
    }
    if (!states.includes(transition.from as string)) {
      fail(`transition từ "${String(transition.from)}" không nằm trong states.`);
    }
    if (!states.includes(transition.to as string)) {
      fail(`transition tới "${String(transition.to)}" không nằm trong states.`);
    }
    if (!isNonEmptyString(transition.role)) {
      fail('mỗi transition cần role dạng chuỗi.');
    }
    if (!isNonEmptyString(transition.guard)) {
      fail('mỗi transition cần guard dạng chuỗi.');
    }
    const key = `${String(transition.from)}->${String(transition.to)}`;
    if (seen.has(key)) {
      fail(`transition ${key} bị trùng.`);
    }
    seen.add(key);
  }
  if (!isStringArray(value.guards)) {
    fail('guards phải là mảng chuỗi.');
  }
  if (!isStringArray(value.approvals)) {
    fail('approvals phải là mảng chuỗi.');
  }
  return parsed as WorkflowDefinition;
}

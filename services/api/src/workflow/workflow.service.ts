// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type {
  TransitionCheck,
  WorkflowDefinition,
  WorkflowTransition,
} from './workflow.types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function copyDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}

// Registry định nghĩa luồng: nạp mọi tệp JSON trong thư mục definitions,
// mỗi tệp là 1 luồng có phiên bản. Thêm luồng mới cho ứng dụng khác chỉ cần
// thêm 1 tệp, engine và API instance dùng lại nguyên vẹn, không sửa code.
@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);
  private definitions = new Map<string, WorkflowDefinition>();

  onModuleInit(): void {
    this.definitions = this.loadDefinitions();
    for (const definition of this.definitions.values()) {
      this.logger.log(
        `Đã nạp định nghĩa luồng ${definition.definitionId} v${definition.version} (${definition.states.length} trạng thái, ${definition.transitions.length} chuyển).`,
      );
    }
  }

  // Thư mục định nghĩa: biến môi trường thắng, mặc định nằm cạnh mã nguồn.
  resolveDefinitionsDir(): string {
    if (process.env.WORKFLOW_DEFINITIONS_DIR) {
      return process.env.WORKFLOW_DEFINITIONS_DIR;
    }
    return join(__dirname, 'definitions');
  }

  getDefinition(definitionId: string): WorkflowDefinition {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}".`,
      );
    }
    return copyDefinition(definition);
  }

  listDefinitions(): WorkflowDefinition[] {
    return [...this.definitions.values()].map(copyDefinition);
  }

  getStates(definitionId: string): string[] {
    return [...this.getDefinition(definitionId).states];
  }

  getTransitions(definitionId: string): WorkflowTransition[] {
    return copyDefinition(this.getDefinition(definitionId)).transitions;
  }

  // Trạng thái đầu là phần tử đầu tiên của states trong tệp định nghĩa.
  getInitialState(definitionId: string): string {
    return this.getDefinition(definitionId).states[0];
  }

  // Trạng thái cuối là trạng thái không còn chuyển nào đi ra.
  isTerminalState(definitionId: string, state: string): boolean {
    return !this.getDefinition(definitionId).transitions.some(
      (item) => item.from === state,
    );
  }

  // Chỉ dựa vào tệp định nghĩa, không có điều kiện chuyển nào ghi trong code.
  // roles là vai nghiệp vụ của người gọi; không truyền roles thì chỉ kiểm
  // tra chuyển có tồn tại, không kiểm tra vai.
  canTransition(
    definitionId: string,
    from: string,
    to: string,
    roles?: string[],
  ): TransitionCheck {
    const definition = this.getDefinition(definitionId);
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
    if (roles !== undefined && !roles.includes(transition.role)) {
      return {
        allowed: false,
        requiredRole: transition.role,
        reason: `Chuyển này yêu cầu vai "${transition.role}", người gọi không có vai này.`,
      };
    }
    return { allowed: true, requiredRole: transition.role, reason: null };
  }

  private loadDefinitions(): Map<string, WorkflowDefinition> {
    const dir = this.resolveDefinitionsDir();
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch (error) {
      throw new Error(
        `Không đọc được thư mục định nghĩa luồng tại ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const jsonFiles = files.filter((file) => file.endsWith('.json')).sort();
    if (jsonFiles.length === 0) {
      throw new Error(
        `Thư mục định nghĩa luồng tại ${dir} không có tệp JSON nào.`,
      );
    }
    const definitions = new Map<string, WorkflowDefinition>();
    for (const file of jsonFiles) {
      const path = join(dir, file);
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
      const definition = validateDefinition(parsed, path);
      if (definitions.has(definition.definitionId)) {
        throw new Error(
          `Định nghĩa luồng "${definition.definitionId}" bị trùng trong thư mục ${dir} (tệp ${file}).`,
        );
      }
      definitions.set(definition.definitionId, definition);
    }
    return definitions;
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

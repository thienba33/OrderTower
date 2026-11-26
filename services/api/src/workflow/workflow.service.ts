// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type {
  TransitionCheck,
  WorkflowDefinition,
  WorkflowTransition,
} from './workflow.types';
import {
  WORKFLOW_VERSION_STORE,
  type WorkflowVersionStore,
} from './version.store';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function copyDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Registry định nghĩa luồng: nạp mọi file JSON trong definitions, nhóm theo
// definitionId + version. Mỗi definition có một version active; instance
// đang chạy pin version lúc start và transition theo đúng version đó.
@Injectable()
export class WorkflowService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(WorkflowService.name);
  private definitions = new Map<string, Map<string, WorkflowDefinition>>();
  private activeVersions = new Map<string, string>();

  constructor(
    @Optional()
    @Inject(WORKFLOW_VERSION_STORE)
    private readonly versionStore?: WorkflowVersionStore,
  ) {}

  onModuleInit(): void {
    this.definitions = this.loadDefinitions();
    for (const [definitionId, versions] of this.definitions) {
      const active = this.pickFallbackVersion(versions);
      this.activeVersions.set(definitionId, active);
      const definition = versions.get(active) as WorkflowDefinition;
      this.logger.log(
        `Đã nạp định nghĩa luồng ${definitionId} v${definition.version} (${definition.states.length} trạng thái, ${definition.transitions.length} chuyển).`,
      );
    }
  }

  // Đọc version active đã được duyệt từ DB sau khi registry file đã nạp.
  // Chạy ở application bootstrap để instance mới dùng đúng version active.
  async onApplicationBootstrap(): Promise<void> {
    if (!this.versionStore) {
      return;
    }
    let stored: Map<string, string>;
    try {
      stored = await this.versionStore.listActiveVersions();
    } catch (error) {
      this.logger.warn(
        `Không đọc được version workflow active: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
    for (const [definitionId, version] of stored) {
      const versions = this.definitions.get(definitionId);
      if (!versions?.has(version)) {
        this.logger.warn(
          `Bỏ qua version active ${definitionId} v${version}: không có file definition tương ứng.`,
        );
        continue;
      }
      this.activeVersions.set(definitionId, version);
      this.logger.log(`Dùng version active ${definitionId} v${version} từ DB.`);
    }
  }

  // Thư mục định nghĩa: biến môi trường thắng, mặc định nằm cạnh mã nguồn.
  resolveDefinitionsDir(): string {
    if (process.env.WORKFLOW_DEFINITIONS_DIR) {
      return process.env.WORKFLOW_DEFINITIONS_DIR;
    }
    return join(__dirname, 'definitions');
  }

  getDefinition(definitionId: string, version?: string): WorkflowDefinition {
    const versions = this.definitions.get(definitionId);
    if (!versions) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}".`,
      );
    }
    const resolvedVersion = version ?? this.activeVersions.get(definitionId);
    const definition =
      resolvedVersion === undefined ? undefined : versions.get(resolvedVersion);
    if (!definition) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}" version "${resolvedVersion ?? ''}".`,
      );
    }
    return copyDefinition(definition);
  }

  listDefinitions(): WorkflowDefinition[] {
    return [...this.definitions.keys()].map((definitionId) =>
      this.getDefinition(definitionId),
    );
  }

  listVersions(definitionId: string): string[] {
    const versions = this.definitions.get(definitionId);
    if (!versions) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}".`,
      );
    }
    return [...versions.keys()].sort((a, b) => compareVersions(b, a));
  }

  getActiveVersion(definitionId: string): string {
    const version = this.activeVersions.get(definitionId);
    if (!version) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}".`,
      );
    }
    return version;
  }

  setActiveVersion(definitionId: string, version: string): void {
    const versions = this.definitions.get(definitionId);
    if (!versions?.has(version)) {
      throw new NotFoundException(
        `Không tìm thấy định nghĩa luồng "${definitionId}" version "${version}".`,
      );
    }
    this.activeVersions.set(definitionId, version);
  }

  getStates(definitionId: string, version?: string): string[] {
    return [...this.getDefinition(definitionId, version).states];
  }

  getTransitions(
    definitionId: string,
    version?: string,
  ): WorkflowTransition[] {
    return copyDefinition(this.getDefinition(definitionId, version)).transitions;
  }

  getTransition(
    definitionId: string,
    from: string,
    to: string,
    version?: string,
  ): WorkflowTransition | undefined {
    return this.getDefinition(definitionId, version).transitions.find(
      (item) => item.from === from && item.to === to,
    );
  }

  // Trạng thái đầu là phần tử đầu tiên của states trong file definition.
  getInitialState(definitionId: string, version?: string): string {
    return this.getDefinition(definitionId, version).states[0];
  }

  // Trạng thái cuối là trạng thái không còn chuyển nào đi ra.
  isTerminalState(
    definitionId: string,
    state: string,
    version?: string,
  ): boolean {
    return !this.getDefinition(definitionId, version).transitions.some(
      (item) => item.from === state,
    );
  }

  // Chỉ dựa vào file definition, không có điều kiện chuyển nào ghi trong code.
  // roles là vai nghiệp vụ của người gọi; không truyền roles thì chỉ kiểm tra
  // chuyển có tồn tại, không kiểm tra vai. version để đánh giá theo đúng bản
  // instance đã pin, không theo bản active mới.
  canTransition(
    definitionId: string,
    from: string,
    to: string,
    roles?: string[],
    version?: string,
  ): TransitionCheck {
    const definition = this.getDefinition(definitionId, version);
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

  private pickFallbackVersion(
    versions: Map<string, WorkflowDefinition>,
  ): string {
    // Khi chưa có quyết định deploy, chọn version thấp nhất để file mới chưa
    // được duyệt không tự động trở thành active.
    return [...versions.keys()].sort(compareVersions)[0];
  }

  private loadDefinitions(): Map<string, Map<string, WorkflowDefinition>> {
    const dir = this.resolveDefinitionsDir();
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch (error) {
      throw new Error(
        `Không đọc được thư mục định nghĩa luồng tại ${dir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const jsonFiles = files.filter((file) => file.endsWith('.json')).sort();
    if (jsonFiles.length === 0) {
      throw new Error(
        `Thư mục định nghĩa luồng tại ${dir} không có tập JSON nào.`,
      );
    }
    const definitions = new Map<string, Map<string, WorkflowDefinition>>();
    for (const file of jsonFiles) {
      const path = join(dir, file);
      let raw: string;
      try {
        raw = readFileSync(path, 'utf-8');
      } catch (error) {
        throw new Error(
          `Không đọc được tập định nghĩa luồng tại ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (error) {
        throw new Error(
          `Tập định nghĩa luồng tại ${path} không phải JSON hợp lệ: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const definition = validateDefinition(parsed, path);
      const versions = definitions.get(definition.definitionId) ?? new Map();
      if (versions.has(definition.version)) {
        throw new Error(
          `Định nghĩa luồng "${definition.definitionId}" version "${definition.version}" bị trùng trong thư mục ${dir} (tập ${file}).`,
        );
      }
      versions.set(definition.version, definition);
      definitions.set(definition.definitionId, versions);
    }
    return definitions;
  }
}

// Kiểm tra hình dạng file định nghĩa, lỗi thì chặn khởi động để không chạy luồng sai.
function validateDefinition(
  parsed: unknown,
  path: string,
): WorkflowDefinition {
  const fail = (message: string): never => {
    throw new Error(`Tập định nghĩa luồng tại ${path} không hợp lệ: ${message}`);
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

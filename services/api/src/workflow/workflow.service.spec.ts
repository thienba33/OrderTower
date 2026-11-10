// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  const originalDefinitionPath = process.env.WORKFLOW_DEFINITION_PATH;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-test-'));
  });

  afterEach(() => {
    if (originalDefinitionPath === undefined) {
      delete process.env.WORKFLOW_DEFINITION_PATH;
    } else {
      process.env.WORKFLOW_DEFINITION_PATH = originalDefinitionPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  function loadService(): WorkflowService {
    const service = new WorkflowService();
    service.onModuleInit();
    return service;
  }

  function writeDefinition(definition: unknown): void {
    const path = join(tempDir, 'order-flow.test.json');
    writeFileSync(path, JSON.stringify(definition));
    process.env.WORKFLOW_DEFINITION_PATH = path;
  }

  it('nạp định nghĩa v1 trong repo: 9 trạng thái, 10 chuyển', () => {
    const service = loadService();
    const definition = service.getDefinition();
    expect(definition.definitionId).toBe('order-flow');
    expect(definition.version).toBe('1');
    expect(definition.states).toHaveLength(9);
    expect(definition.transitions).toHaveLength(10);
  });

  it('cho phép chuyển hợp lệ đúng vai', () => {
    const service = loadService();
    expect(
      service.canTransition('Mới tạo', 'Đã kiểm tra', 'Điều phối viên'),
    ).toEqual({ allowed: true, requiredRole: 'Điều phối viên', reason: null });
  });

  it('từ chối chuyển trái phép kèm lý do', () => {
    const service = loadService();
    const result = service.canTransition('Mới tạo', 'Đã giao');
    expect(result.allowed).toBe(false);
    expect(result.requiredRole).toBeNull();
    expect(result.reason).toContain('không có trong định nghĩa');
  });

  it('từ chối khi sai vai', () => {
    const service = loadService();
    const result = service.canTransition('Mới tạo', 'Đã kiểm tra', 'Tài xế');
    expect(result.allowed).toBe(false);
    expect(result.requiredRole).toBe('Điều phối viên');
  });

  it('bản sao định nghĩa trả ra không làm đổi định nghĩa đã nạp', () => {
    const service = loadService();
    const copy = service.getDefinition();
    copy.states.push('Trạng thái lạ');
    expect(service.getDefinition().states).toHaveLength(9);
  });

  it('đổi tệp định nghĩa, khởi động lại: luồng mới chạy được mà không sửa code', () => {
    const definition = JSON.parse(
      JSON.stringify(loadService().getDefinition()),
    ) as Record<string, unknown>;
    definition.version = '2-test';
    const transitions = definition.transitions as Array<Record<string, string>>;
    transitions.push({
      from: 'Chờ kho',
      to: 'Hủy',
      role: 'Điều phối viên',
      guard: 'có lý do hủy',
    });
    writeDefinition(definition);
    const service = loadService();
    expect(service.getDefinition().version).toBe('2-test');
    expect(
      service.canTransition('Chờ kho', 'Hủy', 'Điều phối viên').allowed,
    ).toBe(true);
  });

  it('tệp định nghĩa sai hình dạng thì chặn khởi động', () => {
    writeDefinition({
      definitionId: 'order-flow',
      version: 'x',
      states: ['A'],
      transitions: [
        { from: 'A', to: 'B', role: 'Ai đó', guard: 'gì đó' },
      ],
      guards: [],
      approvals: [],
    });
    const service = new WorkflowService();
    expect(() => service.onModuleInit()).toThrow('không nằm trong states');
  });
});

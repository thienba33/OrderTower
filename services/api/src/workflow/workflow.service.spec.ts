// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  const originalDefinitionsDir = process.env.WORKFLOW_DEFINITIONS_DIR;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-test-'));
  });

  afterEach(() => {
    if (originalDefinitionsDir === undefined) {
      delete process.env.WORKFLOW_DEFINITIONS_DIR;
    } else {
      process.env.WORKFLOW_DEFINITIONS_DIR = originalDefinitionsDir;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  function loadService(): WorkflowService {
    const service = new WorkflowService();
    service.onModuleInit();
    return service;
  }

  function writeDefinition(
    fileName: string,
    definition: unknown,
  ): void {
    writeFileSync(join(tempDir, fileName), JSON.stringify(definition));
    process.env.WORKFLOW_DEFINITIONS_DIR = tempDir;
  }

  it('nạp định nghĩa v1 trong repo: 9 trạng thái, 10 chuyển', () => {
    const service = loadService();
    const definition = service.getDefinition('order-flow');
    expect(definition.definitionId).toBe('order-flow');
    expect(definition.version).toBe('1');
    expect(definition.states).toHaveLength(9);
    expect(definition.transitions).toHaveLength(10);
  });

  it('nạp được nhiều định nghĩa trong cùng thư mục', () => {
    const base = loadService().getDefinition('order-flow');
    writeDefinition('order-flow.v1.json', base);
    writeDefinition('other-flow.v1.json', {
      ...base,
      definitionId: 'other-flow',
      version: '1',
    });
    const service = loadService();
    expect(service.listDefinitions()).toHaveLength(2);
    expect(service.getDefinition('other-flow').definitionId).toBe(
      'other-flow',
    );
  });

  it('không có định nghĩa thì báo 404', () => {
    const service = loadService();
    expect(() => service.getDefinition('khong-co')).toThrow(
      'Không tìm thấy định nghĩa',
    );
  });

  it('cho phép chuyển hợp lệ đúng vai', () => {
    const service = loadService();
    expect(
      service.canTransition(
        'order-flow',
        'Mới tạo',
        'Đã kiểm tra',
        'Điều phối viên',
      ),
    ).toEqual({ allowed: true, requiredRole: 'Điều phối viên', reason: null });
  });

  it('từ chối chuyển trái phép kèm lý do', () => {
    const service = loadService();
    const result = service.canTransition('order-flow', 'Mới tạo', 'Đã giao');
    expect(result.allowed).toBe(false);
    expect(result.requiredRole).toBeNull();
    expect(result.reason).toContain('không có trong định nghĩa');
  });

  it('từ chối khi sai vai', () => {
    const service = loadService();
    const result = service.canTransition(
      'order-flow',
      'Mới tạo',
      'Đã kiểm tra',
      'Tài xế',
    );
    expect(result.allowed).toBe(false);
    expect(result.requiredRole).toBe('Điều phối viên');
  });

  it('trạng thái đầu là phần tử đầu của states, trạng thái cuối không có chuyển đi ra', () => {
    const service = loadService();
    expect(service.getInitialState('order-flow')).toBe('Mới tạo');
    expect(service.isTerminalState('order-flow', 'Hoàn')).toBe(true);
    expect(service.isTerminalState('order-flow', 'Hủy')).toBe(true);
    expect(service.isTerminalState('order-flow', 'Mới tạo')).toBe(false);
  });

  it('bản sao định nghĩa trả ra không làm đổi định nghĩa đã nạp', () => {
    const service = loadService();
    const copy = service.getDefinition('order-flow');
    copy.states.push('Trạng thái lạ');
    expect(service.getDefinition('order-flow').states).toHaveLength(9);
  });

  it('đổi tệp định nghĩa, khởi động lại: luồng mới chạy được mà không sửa code', () => {
    const definition = JSON.parse(
      JSON.stringify(loadService().getDefinition('order-flow')),
    ) as Record<string, unknown>;
    definition.version = '2-test';
    const transitions = definition.transitions as Array<Record<string, string>>;
    transitions.push({
      from: 'Chờ kho',
      to: 'Hủy',
      role: 'Điều phối viên',
      guard: 'có lý do hủy',
    });
    writeDefinition('order-flow.v1.json', definition);
    const service = loadService();
    expect(service.getDefinition('order-flow').version).toBe('2-test');
    expect(
      service.canTransition('order-flow', 'Chờ kho', 'Hủy', 'Điều phối viên')
        .allowed,
    ).toBe(true);
  });

  it('tệp định nghĩa sai hình dạng thì chặn khởi động', () => {
    writeDefinition('order-flow.v1.json', {
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

// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { WorkflowDeploymentService } from './deployment.service';
import { InMemoryWorkflowVersionStore } from './version.store';
import { WorkflowService } from './workflow.service';

const MANAGER_1: Caller = {
  userId: 'user-m1',
  username: 'manager1',
  roles: ['Quản lý'],
};

const MANAGER_2: Caller = {
  userId: 'user-m2',
  username: 'manager2',
  roles: ['Quản lý'],
};

describe('WorkflowDeploymentService', () => {
  const originalDir = process.env.WORKFLOW_DEFINITIONS_DIR;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workflow-deploy-'));
    const base = JSON.parse(
      readFileSync(
        join(__dirname, 'definitions', 'order-flow.v1.json'),
        'utf-8',
      ),
    ) as Record<string, unknown>;
    writeFileSync(join(dir, 'order-flow.v1.json'), JSON.stringify(base));
    writeFileSync(
      join(dir, 'order-flow.v2.json'),
      JSON.stringify({ ...base, version: '2' }),
    );
    process.env.WORKFLOW_DEFINITIONS_DIR = dir;
  });

  afterEach(() => {
    if (originalDir === undefined) {
      delete process.env.WORKFLOW_DEFINITIONS_DIR;
    } else {
      process.env.WORKFLOW_DEFINITIONS_DIR = originalDir;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  function build() {
    const workflow = new WorkflowService();
    workflow.onModuleInit();
    const audit = new AuditService();
    const approvals = new ApprovalService(audit, new InMemoryApprovalStore());
    const versions = new InMemoryWorkflowVersionStore();
    const deployments = new WorkflowDeploymentService(
      workflow,
      approvals,
      audit,
      versions,
    );
    return { workflow, approvals, versions, deployments };
  }

  it('deploy version mới cần approval đã duyệt và lưu version active', async () => {
    const { workflow, approvals, versions, deployments } = build();
    const request = await deployments.requestDeployment(
      'order-flow',
      '2',
      'nâng cấp luồng',
      MANAGER_1,
    );
    expect(request.status).toBe('pending');
    await expect(
      deployments.activate('order-flow', '2', request.id, MANAGER_2),
    ).rejects.toThrow('chưa thể activate');

    const approved = await approvals.approve(request.id, MANAGER_2, 'ok');
    expect(approved.status).toBe('approved');
    const activated = await deployments.activate(
      'order-flow',
      '2',
      request.id,
      MANAGER_2,
    );
    expect(activated).toMatchObject({
      definitionId: 'order-flow',
      version: '2',
      approvalId: request.id,
    });
    expect(workflow.getActiveVersion('order-flow')).toBe('2');
    expect(await versions.listActiveVersions()).toEqual(
      new Map([['order-flow', '2']]),
    );
  });

  it('không cho request trùng hoặc activate sai subject', async () => {
    const { approvals, deployments } = build();
    const request = await deployments.requestDeployment(
      'order-flow',
      '2',
      'nâng cấp luồng',
      MANAGER_1,
    );
    await expect(
      deployments.requestDeployment('order-flow', '2', 'lần 2', MANAGER_1),
    ).rejects.toThrow('đang chờ duyệt');
    await approvals.approve(request.id, MANAGER_2, 'ok');
    await expect(
      deployments.activate('order-flow', '1', request.id, MANAGER_2),
    ).rejects.toThrow('không phải yêu cầu deploy');
  });

  it('đã activate thì không activate lại cùng approval', async () => {
    const { approvals, deployments } = build();
    const request = await deployments.requestDeployment(
      'order-flow',
      '2',
      'nâng cấp luồng',
      MANAGER_1,
    );
    await approvals.approve(request.id, MANAGER_2, 'ok');
    await deployments.activate('order-flow', '2', request.id, MANAGER_2);
    await expect(
      deployments.activate('order-flow', '2', request.id, MANAGER_2),
    ).rejects.toThrow('đã được dùng');
  });
});

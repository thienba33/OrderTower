// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type {
  WorkflowInstance,
  WorkflowInstanceStore,
} from './instance.types';

export const WORKFLOW_INSTANCE_STORE = 'WORKFLOW_INSTANCE_STORE';

function copyInstance(instance: WorkflowInstance): WorkflowInstance {
  return JSON.parse(JSON.stringify(instance)) as WorkflowInstance;
}

// Lưu instance trong bộ nhớ, sẽ thay bằng Postgres ở commit lưu bền qua cùng
// interface WorkflowInstanceStore. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryWorkflowInstanceStore implements WorkflowInstanceStore {
  private readonly instances = new Map<string, WorkflowInstance>();

  save(instance: WorkflowInstance): void {
    this.instances.set(instance.id, copyInstance(instance));
  }

  findById(id: string): WorkflowInstance | null {
    const found = this.instances.get(id);
    return found ? copyInstance(found) : null;
  }

  findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): WorkflowInstance | null {
    for (const instance of this.instances.values()) {
      if (
        instance.definitionId === definitionId &&
        instance.businessKey === businessKey
      ) {
        return copyInstance(instance);
      }
    }
    return null;
  }

  list(): WorkflowInstance[] {
    return [...this.instances.values()].map(copyInstance);
  }
}

// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Approval, ApprovalStore } from './approval.types';

export const APPROVAL_STORE = 'APPROVAL_STORE';

function copyApproval(approval: Approval): Approval {
  return JSON.parse(JSON.stringify(approval)) as Approval;
}

// Lưu phê duyệt trong bộ nhớ, sẽ thay bằng Postgres ở commit lưu bền qua
// cùng interface ApprovalStore. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, Approval>();

  save(approval: Approval): void {
    this.approvals.set(approval.id, copyApproval(approval));
  }

  findById(id: string): Approval | null {
    const found = this.approvals.get(id);
    return found ? copyApproval(found) : null;
  }

  list(): Approval[] {
    return [...this.approvals.values()].map(copyApproval);
  }
}

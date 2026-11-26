// SPDX-License-Identifier: Apache-2.0

export const WORKFLOW_DEPLOYMENT_APPROVAL_TYPE = 'workflow.definition.deploy';

export interface WorkflowVersionInfo {
  definitionId: string;
  activeVersion: string;
  versions: string[];
}

export interface WorkflowActivationResult {
  definitionId: string;
  version: string;
  approvalId: string;
  activatedBy: string;
  activatedAt: string;
}

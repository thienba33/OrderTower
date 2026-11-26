// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Approval } from '../approvals/approval.types';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { WORKFLOW_DEPLOY_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { WorkflowDeploymentService } from './deployment.service';
import type {
  WorkflowActivationResult,
  WorkflowVersionInfo,
} from './deployment.types';

@Controller('workflow/definitions')
@Roles(...WORKFLOW_DEPLOY_ROLES)
export class WorkflowDeploymentController {
  constructor(private readonly deployments: WorkflowDeploymentService) {}

  @Get(':definitionId/versions')
  listVersions(@Param('definitionId') definitionId: string): WorkflowVersionInfo {
    return this.deployments.listVersions(definitionId);
  }

  @Post(':definitionId/versions/:version/deployment-requests')
  requestDeployment(
    @Param('definitionId') definitionId: string,
    @Param('version') version: string,
    @Body() body: { reason?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<Approval> {
    return this.deployments.requestDeployment(
      definitionId,
      version,
      body.reason ?? '',
      req.user,
    );
  }

  @Post(':definitionId/versions/:version/activate')
  activate(
    @Param('definitionId') definitionId: string,
    @Param('version') version: string,
    @Body() body: { approvalId?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowActivationResult> {
    return this.deployments.activate(
      definitionId,
      version,
      body.approvalId ?? '',
      req.user,
    );
  }
}

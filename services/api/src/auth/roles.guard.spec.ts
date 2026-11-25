// SPDX-License-Identifier: Apache-2.0
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.types';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class SampleController {
  open(): void {}

  @Roles('Quản trị viên', 'Quản lý')
  restricted(): void {}
}

function contextFor(
  handler: () => void,
  user?: AuthenticatedRequest['user'],
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => SampleController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const admin = {
    userId: 'u1',
    username: 'admin',
    roles: ['Quản trị viên'],
  };
  const warehouse = {
    userId: 'u2',
    username: 'kho',
    roles: ['Nhân viên kho'],
  };

  it('cho qua khi handler không khai báo @Roles', () => {
    expect(
      guard.canActivate(
        contextFor(SampleController.prototype.open, warehouse),
      ),
    ).toBe(true);
  });

  it('cho qua khi người dùng có một vai được phép', () => {
    expect(
      guard.canActivate(
        contextFor(SampleController.prototype.restricted, admin),
      ),
    ).toBe(true);
  });

  it('chặn 403 khi người dùng không có vai được phép', () => {
    expect(() =>
      guard.canActivate(
        contextFor(SampleController.prototype.restricted, warehouse),
      ),
    ).toThrow(ForbiddenException);
  });

  it('chặn 401 khi request chưa có user', () => {
    expect(() =>
      guard.canActivate(contextFor(SampleController.prototype.restricted)),
    ).toThrow(UnauthorizedException);
  });
});

// SPDX-License-Identifier: Apache-2.0
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('giữ tenant trong callback và fallback default', () => {
    const context = new TenantContextService();
    expect(context.getTenantId()).toBe('default');

    const result = context.run('tenant-b', () => {
      expect(context.getTenantId()).toBe('tenant-b');
      return context.run(undefined, () => context.getTenantId());
    });
    expect(result).toBe('default');
    expect(context.getTenantId()).toBe('default');
  });

  it('trim tenant và bỏ qua chuỗi rỗng', () => {
    const context = new TenantContextService();
    expect(context.run(' tenant-a ', () => context.getTenantId())).toBe(
      'tenant-a',
    );
    expect(context.run('   ', () => context.getTenantId())).toBe('default');
  });
});

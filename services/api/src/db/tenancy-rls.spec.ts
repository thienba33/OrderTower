// SPDX-License-Identifier: Apache-2.0
import {
  buildTenancyRlsSql,
  TENANT_RLS_TABLES,
  TENANT_TRIGGER_ONLY_TABLES,
} from './tenancy-rls';

describe('buildTenancyRlsSql', () => {
  it('bật RLS/trigger cho bảng nghiệp vụ và chỉ trigger cho audit', () => {
    const sql = buildTenancyRlsSql();
    expect(TENANT_RLS_TABLES).toContain('orders');
    expect(TENANT_RLS_TABLES).toContain('outbox_events');
    expect(TENANT_TRIGGER_ONLY_TABLES).toEqual(['audit_log']);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY tenant_isolation ON orders');
    expect(sql).toContain('CREATE TRIGGER trg_tenant_id');
    expect(sql).toContain('BEFORE INSERT ON audit_log');
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY audit_log');
  });
});

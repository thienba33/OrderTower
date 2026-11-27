// SPDX-License-Identifier: Apache-2.0

// Bảng nghiệp vụ có tenant_id và RLS. audit_log có tenant_id nhưng giữ chuỗi
// hash toàn cục nên chỉ gắn trigger gán tenant, không bật RLS.
export const TENANT_RLS_TABLES: readonly string[] = [
  'orders',
  'order_history',
  'workflow_instances',
  'workflow_instance_history',
  'approvals',
  'inventory',
  'shipments',
  'shipment_history',
  'vehicles',
  'drivers',
  'delivery_events',
  'channels',
  'returns',
  'customers',
  'assignments',
  'call_logs',
  'restricted_flags',
  'bi_recommendations',
  'bi_feedback',
  'dx_score_snapshots',
  'tickets',
  'files',
  'outbox_events',
  'telemetry_readings',
];

export const TENANT_TRIGGER_ONLY_TABLES: readonly string[] = ['audit_log'];

const TENANT_EXPRESSION =
  "COALESCE(NULLIF(current_setting('app.tenant_id', true), ''), 'default')";

// SQL idempotent: chạy lại mỗi lần khởi động vẫn an toàn. Trigger gán
// tenant_id trước khi RLS WITH CHECK chạy; policy lọc đọc/ghi theo tenant.
export function buildTenancyRlsSql(): string {
  const statements = [
    `CREATE OR REPLACE FUNCTION ordertower_set_tenant_id()
     RETURNS trigger AS $$
     BEGIN
       NEW.tenant_id := ${TENANT_EXPRESSION};
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
  ];
  for (const table of TENANT_TRIGGER_ONLY_TABLES) {
    statements.push(
      `DROP TRIGGER IF EXISTS trg_tenant_id ON ${table}`,
      `CREATE TRIGGER trg_tenant_id
         BEFORE INSERT ON ${table}
         FOR EACH ROW EXECUTE FUNCTION ordertower_set_tenant_id()`,
    );
  }
  for (const table of TENANT_RLS_TABLES) {
    statements.push(
      `DROP TRIGGER IF EXISTS trg_tenant_id ON ${table}`,
      `CREATE TRIGGER trg_tenant_id
         BEFORE INSERT ON ${table}
         FOR EACH ROW EXECUTE FUNCTION ordertower_set_tenant_id()`,
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON ${table}`,
      `CREATE POLICY tenant_isolation ON ${table}
         USING (tenant_id = ${TENANT_EXPRESSION})
         WITH CHECK (tenant_id = ${TENANT_EXPRESSION})`,
    );
  }
  return `${statements.join(';\n')};`;
}

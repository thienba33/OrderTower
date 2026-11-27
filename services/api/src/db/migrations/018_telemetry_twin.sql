-- SPDX-License-Identifier: Apache-2.0
-- Migration 018: telemetry readings cho IT/OT digital twin.
-- Moi reading la 1 mau cam bien gan voi xe; twin state duoc tinh tu reading
-- moi nhat, khong luu bang rieng. tenant_id de RLS ap dung nhu cac bang khac.

CREATE TABLE IF NOT EXISTS telemetry_readings (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  device_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  temperature_c DOUBLE PRECISION,
  battery_pct DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'device',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_recorded
  ON telemetry_readings (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_recorded
  ON telemetry_readings (tenant_id, recorded_at DESC);

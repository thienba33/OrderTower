// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type {
  TelemetryReading,
  TelemetrySource,
  TelemetryStore,
} from './telemetry.types';

export const TELEMETRY_STORE = 'TELEMETRY_STORE';

function copyReading(reading: TelemetryReading): TelemetryReading {
  return JSON.parse(JSON.stringify(reading)) as TelemetryReading;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function mapReadingRow(row: Record<string, unknown>): TelemetryReading {
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    vehicleId: row.vehicle_id as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    temperatureC: toNumberOrNull(row.temperature_c),
    batteryPct: toNumberOrNull(row.battery_pct),
    source: row.source as TelemetrySource,
    payload: toPayload(row.payload),
    recordedAt: toIso(row.recorded_at),
    createdAt: toIso(row.created_at),
  };
}

const TELEMETRY_COLUMNS = `id, device_id, vehicle_id, lat, lng, temperature_c,
  battery_pct, source, payload, recorded_at, created_at`;

// Kho trong bo nho cho unit test. Moi lan doc tra ban sao de tranh mutate.
@Injectable()
export class InMemoryTelemetryStore implements TelemetryStore {
  private readonly readings: TelemetryReading[] = [];

  async save(reading: TelemetryReading): Promise<void> {
    this.readings.push(copyReading(reading));
  }

  async listByVehicle(
    vehicleId: string,
    limit: number,
  ): Promise<TelemetryReading[]> {
    return this.readings
      .filter((reading) => reading.vehicleId === vehicleId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, limit)
      .map(copyReading);
  }

  async latestByVehicle(vehicleId: string): Promise<TelemetryReading | null> {
    const found = this.readings
      .filter((reading) => reading.vehicleId === vehicleId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return found.length > 0 ? copyReading(found[0]) : null;
  }

  async listRecent(limit: number): Promise<TelemetryReading[]> {
    return [...this.readings]
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, limit)
      .map(copyReading);
  }
}

// Kho Postgres. readings la append-only; khong update/xoa de giu lich su.
export class PostgresTelemetryStore implements TelemetryStore {
  constructor(private readonly db: Queryable) {}

  async save(reading: TelemetryReading): Promise<void> {
    await this.db.query(
      `INSERT INTO telemetry_readings
         (id, device_id, vehicle_id, lat, lng, temperature_c, battery_pct,
          source, payload, recorded_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        reading.id,
        reading.deviceId,
        reading.vehicleId,
        reading.lat,
        reading.lng,
        reading.temperatureC,
        reading.batteryPct,
        reading.source,
        JSON.stringify(reading.payload),
        reading.recordedAt,
        reading.createdAt,
      ],
    );
  }

  async listByVehicle(
    vehicleId: string,
    limit: number,
  ): Promise<TelemetryReading[]> {
    const found = await this.db.query(
      `SELECT ${TELEMETRY_COLUMNS}
         FROM telemetry_readings
        WHERE vehicle_id = $1
        ORDER BY recorded_at DESC
        LIMIT $2`,
      [vehicleId, limit],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapReadingRow);
  }

  async latestByVehicle(vehicleId: string): Promise<TelemetryReading | null> {
    const found = await this.db.query(
      `SELECT ${TELEMETRY_COLUMNS}
         FROM telemetry_readings
        WHERE vehicle_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [vehicleId],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapReadingRow(found.rows[0] as Record<string, unknown>);
  }

  async listRecent(limit: number): Promise<TelemetryReading[]> {
    const found = await this.db.query(
      `SELECT ${TELEMETRY_COLUMNS}
         FROM telemetry_readings
        ORDER BY recorded_at DESC
        LIMIT $1`,
      [limit],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapReadingRow);
  }
}

"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Radio,
  MapPin,
  Thermometer,
  BatteryMedium,
  User,
} from "lucide-react";
import { Pagination, type PaginationRange } from "@/components/ui/Pagination";
import type { ApiVehicleTwin, TwinStatus } from "./fleet-twin-types";

const PAGE_SIZE = 7;

const STATUS_LABEL: Record<TwinStatus, string> = {
  online: "Online",
  stale: "Stale",
  offline: "Offline",
};

const STATUS_CLASS: Record<TwinStatus, string> = {
  online: "bg-emerald-100 text-emerald-800",
  stale: "bg-amber-100 text-amber-800",
  offline: "bg-gray-200 text-gray-700",
};

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "--";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) {
    return "chưa có dữ liệu";
  }
  if (ageSeconds < 60) {
    return "vừa xong";
  }
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) {
    return `${minutes} phút trước`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ trước`;
}

function formatNumber(value: number | null, suffix: string): string {
  return value === null ? "--" : `${value.toFixed(1)}${suffix}`;
}

export default function FleetTwinClient({
  initialTwins,
  canSimulate,
}: {
  initialTwins: ApiVehicleTwin[];
  canSimulate: boolean;
}) {
  const router = useRouter();
  const [twins, setTwins] = useState<ApiVehicleTwin[]>(initialTwins);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Danh sách xe tăng theo đội xe nên phân trang 7 dòng/trang.
  const totalPages = Math.max(1, Math.ceil(twins.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTwins = twins.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const range: PaginationRange =
    twins.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (safePage - 1) * PAGE_SIZE + 1,
          end: Math.min(safePage * PAGE_SIZE, twins.length),
          total: twins.length,
        };

  // Server component refresh trả prop mới; đồng bộ lại state local.
  useEffect(() => {
    setTwins(initialTwins);
  }, [initialTwins]);

  const online = twins.filter((twin) => twin.status === "online").length;
  const stale = twins.filter((twin) => twin.status === "stale").length;
  const offline = twins.filter((twin) => twin.status === "offline").length;

  async function simulate(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/telemetry/simulate", {
        method: "POST",
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: unknown }).message)
            : `API trả về ${response.status}.`;
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError("Không gọi được API tạo dữ liệu cảm biến.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Giám sát đội xe
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Theo dõi vị trí, nhiệt độ, pin, tài xế phụ trách và trạng thái kết
            nối của từng xe dựa trên dữ liệu cảm biến gần nhất.
          </p>
        </div>
        {canSimulate ? (
          <button
            type="button"
            onClick={simulate}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "Đang tạo dữ liệu..." : "Tạo dữ liệu cảm biến mẫu"}
          </button>
        ) : (
          <p className="text-xs text-gray-500">
            Chỉ vai điều hành được tạo dữ liệu cảm biến mẫu.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Tổng số xe</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {twins.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Online</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {online}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Stale</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{stale}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Offline</p>
          <p className="mt-1 text-2xl font-semibold text-gray-700">
            {offline}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Xe</th>
              <th className="px-4 py-3">Tài xế</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Vị trí cuối</th>
              <th className="px-4 py-3">Nhiệt độ</th>
              <th className="px-4 py-3">Pin</th>
              <th className="px-4 py-3">Lần cuối</th>
              <th className="px-4 py-3">Nguồn</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pagedTwins.map((twin) => {
              const last = twin.lastReading;
              const temperature = last?.temperatureC ?? null;
              const battery = last?.batteryPct ?? null;
              return (
                <tr key={twin.vehicle.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {twin.vehicle.plate}
                    </p>
                    <p className="text-xs text-gray-500">
                      {twin.vehicle.id} · {twin.vehicle.type}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {twin.driver ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                          <User size={14} className="text-gray-400" />
                          {twin.driver.name}
                        </span>
                        <a
                          href={`tel:${twin.driver.phone}`}
                          className="text-xs text-gray-600"
                        >
                          {twin.driver.phone}
                        </a>
                        <p className="text-xs text-gray-500">
                          Trạng thái: {twin.driver.status}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={
                              twin.driver.source === "shipment"
                                ? "rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"
                                : "rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                            }
                          >
                            {twin.driver.source === "shipment"
                              ? "Gán theo chuyến"
                              : "Gán thường lái"}
                          </span>
                          {twin.driver.shipmentId ? (
                            <span className="text-xs text-gray-500">
                              {twin.driver.shipmentId}
                            </span>
                          ) : null}
                          {twin.driver.orderId ? (
                            <Link
                              href={`/orders/${twin.driver.orderId}`}
                              className="text-xs font-medium text-red-700 underline"
                            >
                              {twin.driver.orderId}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Chưa gán</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[twin.status]}`}
                    >
                      <Radio size={12} />
                      {STATUS_LABEL[twin.status]}
                    </span>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatAge(twin.ageSeconds)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {last ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 text-gray-700">
                          <MapPin size={14} className="text-gray-400" />
                          {last.lat.toFixed(5)}, {last.lng.toFixed(5)}
                        </span>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${last.lat}&mlon=${last.lng}#map=15/${last.lat}/${last.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-red-700 underline"
                        >
                          Mở bản đồ
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-400">Chưa có telemetry</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Thermometer size={14} className="text-gray-400" />
                      {formatNumber(temperature, " °C")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {battery === null ? (
                      <span className="text-gray-400">--</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 text-gray-700">
                          <BatteryMedium size={14} className="text-gray-400" />
                          {battery.toFixed(0)}%
                        </span>
                        <div className="h-1.5 w-20 rounded bg-gray-200">
                          <div
                            className="h-1.5 rounded bg-emerald-600"
                            style={{
                              width: `${Math.max(0, Math.min(100, battery))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatDateTime(twin.lastSeen)}
                  </td>
                  <td className="px-4 py-3">
                    {last ? (
                      <span
                        className={
                          last.source === "simulated"
                            ? "rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                            : "rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"
                        }
                      >
                        {last.source === "simulated" ? "Mẫu" : "Thiết bị"}
                      </span>
                    ) : (
                      <span className="text-gray-400">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {twins.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  Chưa có xe để hiển thị twin.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="border-t">
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} range={range} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Ngưỡng: online ≤ 5 phút, stale ≤ 30 phút, còn lại offline. Tài xế được
        lấy từ chuyến đang giao; nếu chưa có, lấy từ gán thường lái trên hồ sơ
        tài xế. Dữ liệu cảm biến mẫu chỉ dùng cho demo, không phải số liệu vận
        hành thật.
      </p>
    </div>
  );
}

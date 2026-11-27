"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { Database } from "lucide-react";
import type {
  ApiArchiveSummary,
  ApiColdAnalytics,
  ApiColdGroup,
} from "../cold-data/cold-data-types";

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function GroupTable({
  title,
  rows,
  keyLabel,
  formatKey,
}: {
  title: string;
  rows: ApiColdGroup[];
  keyLabel: string;
  formatKey?: (value: string) => string;
}) {
  return (
    <div className="rounded-md border border-gray-200">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h3>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2">{keyLabel}</th>
            <th className="px-3 py-2 text-right">Đơn</th>
            <th className="px-3 py-2 text-right">Doanh thu</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.slice(0, 7).map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2 text-gray-700">
                {formatKey ? formatKey(row.key) : row.key}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {row.count}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {formatVnd(row.revenue)}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-3 py-5 text-center text-xs text-gray-500"
              >
                Chưa có dữ liệu.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function ColdDataSourceSection({
  summary,
  analytics,
  error,
}: {
  summary: ApiArchiveSummary | null;
  analytics: ApiColdAnalytics | null;
  error: "unauthorized" | "load-failed" | null;
}) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Database size={16} className="text-gray-500" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">
            Nguồn dữ liệu lịch sử
          </h2>
          <p className="text-xs text-gray-500">
            Đọc từ Parquet trên SeaweedFS; không truy vấn OLTP.
          </p>
        </div>
        <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
          Cold Parquet
        </span>
        <Link
          href="/cold-data"
          className="text-xs font-medium text-red-700 underline"
        >
          Quản lý kho dữ liệu lạnh
        </Link>
      </div>

      {error !== null ? (
        <p className="px-4 py-4 text-sm text-gray-700">
          Không tải được cold data.{" "}
          <Link href="/cold-data" className="font-medium text-red-700 underline">
            Mở kho dữ liệu lạnh
          </Link>
        </p>
      ) : summary === null || analytics === null || summary.runCount === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-700">
          Chưa có cold data.{" "}
          <Link href="/cold-data" className="font-medium text-red-700 underline">
            Chạy archive
          </Link>{" "}
          để tạo Parquet đầu tiên.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">
                Đơn trong OLTP
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {summary.ordersInOltp}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">
                Đơn đã archive
              </p>
              <p className="mt-1 text-xl font-semibold text-red-700">
                {summary.archivedOrders}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Cold rows</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {analytics.rows}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">
                Doanh thu cold
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {formatVnd(analytics.totalRevenue)}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">
                Run gần nhất
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {summary.lastRun?.id ?? "--"}
              </p>
              <p className="text-xs text-gray-500">
                {summary.lastRun
                  ? `${formatDateTime(summary.lastRun.finishedAt)} · ${formatBytes(summary.coldBytes)}`
                  : "Chưa có"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <GroupTable
              title="Cold data theo ngày"
              rows={analytics.byDay.slice(-7)}
              keyLabel="Ngày"
              formatKey={formatDay}
            />
            <GroupTable
              title="Cold data theo kênh"
              rows={analytics.byChannel}
              keyLabel="Kênh"
            />
          </div>

          <p className="text-xs text-gray-500">
            Cold data là bản sao Parquet; đơn gốc vẫn trong OLTP để giữ
            workflow/audit. Các chỉ số dự báo/bất thường phía trên vẫn đọc
            OLTP; khối này chỉ bổ sung nguồn lịch sử để đối chiếu doanh thu và
            độ phủ dữ liệu.
          </p>
        </div>
      )}
    </section>
  );
}

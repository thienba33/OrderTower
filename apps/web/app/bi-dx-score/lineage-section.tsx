"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { ReactNode } from "react";
import { GitBranch } from "lucide-react";
import type {
  ApiBiLineage,
  ApiLineageAxis,
  ApiLineageCoverage,
  ApiLineageRatio,
} from "./bi-lineage-types";

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

function formatPercent(ratio: ApiLineageRatio): string {
  if (!ratio.measured || ratio.value === null) return "Chưa đo";
  return `${Math.round(ratio.value * 100)}% (n=${ratio.n})`;
}

function formatInputs(
  inputs: Record<string, number | string | null>,
): string {
  const entries = Object.entries(inputs).slice(0, 4);
  if (entries.length === 0) return "--";
  return entries.map(([key, value]) => `${key}=${value ?? "--"}`).join(", ");
}

function AxisCard({
  axis,
  coverage,
}: {
  axis: ApiLineageAxis;
  coverage: ApiLineageCoverage | undefined;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{axis.axis}</p>
        <p className="text-sm font-semibold text-red-700">
          {axis.score} / {axis.maxScore}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Đo được {coverage?.measured ?? 0}/{coverage?.total ?? axis.ratios.length}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {axis.ratios.map((ratio) => (
          <div key={ratio.key} className="rounded border border-gray-100 p-2">
            <p className="text-xs font-medium text-gray-700">{ratio.label}</p>
            <p className="text-xs text-gray-500">{formatPercent(ratio)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">{ratio.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceTable({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: ReactNode;
  empty: string;
}) {
  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h3>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-4 text-xs text-gray-500">{empty}</p>
      ) : (
        <div className="max-h-64 overflow-auto">{children}</div>
      )}
    </div>
  );
}

export default function LineageSection({
  lineage,
  error,
}: {
  lineage: ApiBiLineage | null;
  error: "unauthorized" | "load-failed" | null;
}) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <GitBranch size={16} className="text-gray-500" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">
            Phả hệ dữ liệu
          </h2>
          <p className="text-xs text-gray-500">
            Snapshot → P/D/I/H → recommendation/input → order/audit → archive
          </p>
        </div>
        <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
          Lineage
        </span>
        <Link
          href="/cold-data"
          className="text-xs font-medium text-red-700 underline"
        >
          Kho dữ liệu lạnh
        </Link>
      </div>

      {error !== null ? (
        <p className="px-4 py-4 text-sm text-gray-700">
          Không tải được phả hệ dữ liệu. Thử tải lại trang.
        </p>
      ) : lineage === null ? (
        <p className="px-4 py-4 text-sm text-gray-700">
          Chưa có snapshot DX-Score để dựng phả hệ. Mở tab Hoạt động để tính
          DX-Score trước.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Snapshot</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {lineage.snapshot.id}
              </p>
              <p className="text-xs text-gray-500">
                Formula {lineage.snapshot.formulaVersion}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">
                Ngày tham chiếu
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {lineage.snapshot.referenceDate || "--"}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Điểm</p>
              <p className="mt-1 text-lg font-semibold text-red-700">
                {lineage.snapshot.total} / 100
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Tính lúc</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {formatDateTime(lineage.snapshot.computedAt)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {lineage.axes.map((axis) => (
              <AxisCard
                key={axis.axis}
                axis={axis}
                coverage={lineage.coverage.find(
                  (item) => item.axis === axis.axis,
                )}
              />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <SourceTable
              title="Đề xuất / input"
              count={lineage.sources.recommendations.length}
              empty="Chưa có recommendation."
            >
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Anomaly</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2">Input</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineage.sources.recommendations.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {item.id}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.anomalyKey}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.status}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatInputs(item.inputs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SourceTable>

            <SourceTable
              title="Đơn / audit"
              count={lineage.sources.orders.length + lineage.sources.audit.length}
              empty="Chưa có order/audit ref."
            >
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Nguồn</th>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Chi tiết</th>
                    <th className="px-3 py-2">Thời điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineage.sources.orders.slice(0, 8).map((item) => (
                    <tr key={`order-${item.id}`}>
                      <td className="px-3 py-2 text-gray-500">OLTP</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/orders/${item.id}`}
                          className="font-medium text-red-700 underline"
                        >
                          {item.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.state}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDateTime(item.updatedAt)}
                      </td>
                    </tr>
                  ))}
                  {lineage.sources.audit.slice(0, 8).map((item) => (
                    <tr key={`audit-${item.seq}`}>
                      <td className="px-3 py-2 text-gray-500">Audit</td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.orderId ?? "--"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.action}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDateTime(item.at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SourceTable>

            <SourceTable
              title="Archive / cold data"
              count={lineage.sources.archive.length}
              empty="Chưa có đơn archive."
            >
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Đơn</th>
                    <th className="px-3 py-2">Run</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2">Archive lúc</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineage.sources.archive.slice(0, 8).map((item) => (
                    <tr key={`${item.orderId}-${item.archiveKey}`}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/orders/${item.orderId}`}
                          className="font-medium text-red-700 underline"
                        >
                          {item.orderId}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.runId ?? "--"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {item.rowCount}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDateTime(item.archivedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SourceTable>

            <SourceTable
              title="Feedback trục I"
              count={lineage.sources.feedback.length}
              empty="Chưa có feedback."
            >
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Recommendation</th>
                    <th className="px-3 py-2">Đúng</th>
                    <th className="px-3 py-2">Thời điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineage.sources.feedback.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {item.id}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.recommendationId}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.correct ? "Có" : "Không"}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDateTime(item.recordedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SourceTable>
          </div>

          <p className="text-xs text-gray-500">
            Phả hệ chỉ trả ID/trạng thái/counts. Không có phone, địa chỉ hay tên
            khách hàng; audit detail cũng không được trả ra.
          </p>
        </div>
      )}
    </section>
  );
}

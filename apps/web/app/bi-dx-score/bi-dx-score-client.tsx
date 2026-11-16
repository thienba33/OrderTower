"use client";

// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  ANOMALIES,
  BI_FEEDBACK_LOGGED,
  BI_TABS,
  BI_TODOS,
  BI_TOTAL_SKU,
  DX_AFTER,
  DX_AXES,
  DX_BEFORE,
  DX_LOGS,
  DX_TOTAL,
  DX_TOTAL_MAX,
  FORECAST_MINI_ROWS,
  FORECAST_ROWS,
  formatForecastChange,
  forecastChangePercent,
  type Anomaly,
  type BiTab,
  type DxLog,
  type DxPeriod,
  type ForecastRow,
} from "../../data/bi-dx";

const PAGE_SIZE = 5;

const forecastColumns: TableColumn<ForecastRow>[] = [
  { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[129px]" },
  { key: "name", header: "Sản phẩm", render: (row) => row.name, cellClassName: "w-[218px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[119px]" },
  { key: "lastWeek", header: "Tuần trước", render: (row) => String(row.lastWeek), cellClassName: "w-[129px]" },
  { key: "forecast", header: "Dự báo", render: (row) => String(row.forecast), cellClassName: "w-[129px]" },
  {
    key: "change",
    header: "Thay đổi",
    render: (row) => (
      <span className={forecastChangePercent(row) >= 40 ? "font-medium text-red-700" : "text-gray-700"}>
        {formatForecastChange(row)}
      </span>
    ),
    cellClassName: "w-[129px]",
  },
  { key: "explanation", header: "Giải thích (đầu vào)", render: (row) => row.explanation, cellClassName: "w-[299px] !whitespace-normal" },
];

const anomalyColumns = (onDecide: (id: string) => void): TableColumn<Anomaly>[] => [
  { key: "title", header: "Bất thường", render: (row) => <span className="font-medium text-gray-900">{row.title}</span>, cellClassName: "w-[219px]" },
  { key: "evidence", header: "Bằng chứng", render: (row) => row.evidence, cellClassName: "w-[319px] !whitespace-normal" },
  { key: "proposal", header: "Đề xuất hành động", render: (row) => row.proposal, cellClassName: "w-[298px] !whitespace-normal" },
  { key: "approver", header: "Người duyệt", render: (row) => row.approver, cellClassName: "w-[119px]" },
  {
    key: "actions",
    header: "Hành động",
    render: (row) => (
      <span className="flex items-center gap-2 text-xs font-medium">
        <button type="button" onClick={() => onDecide(row.id)} className="text-red-700 underline">
          Duyệt
        </button>
        <button type="button" onClick={() => onDecide(row.id)} className="text-gray-500 underline">
          Từ chối
        </button>
      </span>
    ),
    cellClassName: "w-[199px]",
  },
];

const dxPeriodColumns: TableColumn<DxPeriod>[] = [
  { key: "label", header: "Giai đoạn", render: (row) => <span className="font-medium text-gray-900">{row.label}</span>, cellClassName: "w-[199px]" },
  { key: "p", header: "P / 30", render: (row) => String(row.p), cellClassName: "w-[139px]" },
  { key: "d", header: "D / 30", render: (row) => String(row.d), cellClassName: "w-[139px]" },
  { key: "i", header: "I / 30", render: (row) => String(row.i), cellClassName: "w-[139px]" },
  { key: "total", header: "Tổng / 90", render: (row) => String(row.total), cellClassName: "w-[139px]" },
  { key: "h", header: "H / 100", render: (row) => String(row.h), cellClassName: "w-[139px]" },
  { key: "source", header: "Nguồn và thời điểm đóng băng", render: (row) => row.source, cellClassName: "w-[258px] !whitespace-normal" },
];

const dxLogColumns: TableColumn<DxLog>[] = [
  { key: "id", header: "Mã log", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[139px]" },
  { key: "metric", header: "Chỉ số", render: (row) => row.metric, cellClassName: "w-[199px]" },
  { key: "value", header: "Giá trị", render: (row) => row.value, cellClassName: "w-[139px]" },
  { key: "source", header: "Nguồn log", render: (row) => row.source, cellClassName: "w-[278px] !whitespace-normal" },
  { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "w-[159px]" },
  { key: "check", header: "Kiểm tra", render: (row) => "Xem log gốc", cellClassName: "w-[239px]" },
];

export default function BiDxScorePage() {
  const [activeTab, setActiveTab] = useState<BiTab>("Tổng quan");
  const [anomalies, setAnomalies] = useState<Anomaly[]>(ANOMALIES);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(FORECAST_ROWS.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return FORECAST_ROWS.slice(start, start + PAGE_SIZE);
  }, [page]);
  const range = useMemo(
    () => ({
      start: (page - 1) * PAGE_SIZE + 1,
      end: Math.min(page * PAGE_SIZE, FORECAST_ROWS.length),
      total: FORECAST_ROWS.length,
    }),
    [page],
  );

  const decideAnomaly = (id: string) => {
    setAnomalies((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">BI và DX-Score</h1>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Nhóm BI">
        {BI_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex h-9 items-center justify-center rounded-md px-4 text-sm ${
              activeTab === tab
                ? "bg-red-700 font-medium text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">SKU đủ lịch sử</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">
            {FORECAST_ROWS.length} / {BI_TOTAL_SKU}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Bất thường đang mở</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{anomalies.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Đề xuất chờ duyệt</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{anomalies.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Phản hồi đã ghi</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{BI_FEEDBACK_LOGGED}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">DX-Score</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">
            {DX_TOTAL} / {DX_TOTAL_MAX}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        <section className="min-w-0 flex-1 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Dự báo tuần tới - nhóm SKU đủ lịch sử</h2>
          <div className="mt-3 flex flex-col gap-3">
            {FORECAST_MINI_ROWS.map((row) => (
              <div key={`${row.sku}-${row.channel}`} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] font-medium text-gray-900">
                    {row.sku} - {row.channel}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.forecast} đơn (tuần trước {row.lastWeek}, +{row.changePercent}%)
                  </p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-red-700" style={{ width: `${row.barPercent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-white p-4 xl:w-[468px] xl:shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Những việc cần làm</h2>
          <div className="mt-3 flex flex-col gap-3">
            {BI_TODOS.map((todo) => (
              <div key={todo.rank} className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-xs font-bold text-white">
                  {todo.rank}
                </span>
                <p className="flex-1 text-[13px] text-gray-700">{todo.text}</p>
                <Link
                  href={todo.href}
                  className="flex h-8 shrink-0 items-center justify-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white"
                >
                  {todo.button}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Dự báo nhu cầu theo SKU và kênh (7 ngày tới)</h2>
        </div>
        <Table columns={forecastColumns} rows={pageRows} rowKey={(row) => `${row.sku}-${row.channel}`} bare />
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} range={range} />
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Phát hiện bất thường và đề xuất (kèm giải thích, cần duyệt)</h2>
        </div>
        <Table
          columns={anomalyColumns(decideAnomaly)}
          rows={anomalies}
          rowKey={(row) => row.id}
          bare
          emptyText="Không có bất thường đang mở"
        />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-gray-900">DX-Score radar HPDI - đo từ log vận hành thật</h2>
          <p className="shrink-0 text-sm font-semibold text-red-700">
            {DX_TOTAL} / {DX_TOTAL_MAX} - H {DX_AXES[3].value}/100
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {DX_AXES.map((axis) => (
            <div key={axis.key} className="flex items-center gap-3">
              <p className="w-6 shrink-0 text-[13px] font-semibold text-gray-900">{axis.key}</p>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-2.5 rounded-full bg-red-700"
                  style={{ width: `${(axis.value / axis.max) * 100}%` }}
                />
              </div>
              <p className="w-[70px] shrink-0 text-[13px] font-semibold text-gray-900">
                {axis.value} / {axis.max}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <Table columns={dxPeriodColumns} rows={[DX_BEFORE, DX_AFTER]} rowKey={(row) => row.label} bare />
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Log gốc bấm xuống được (mỗi điểm số đều có log)</h2>
        </div>
        <Table columns={dxLogColumns} rows={DX_LOGS} rowKey={(row) => row.id} bare />
      </section>
    </div>
  );
}

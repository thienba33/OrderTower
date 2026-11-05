"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import Link from "next/link";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  APPROVAL_QUEUE,
  BI_ANOMALIES,
  DX_AXES,
  DX_SCORE_TOTAL,
  GUARDRAIL_BLOCKS,
  ORDER_FLOW_STATES,
  OVERVIEW_KPIS,
  SLA_RISK_ORDERS,
  type SlaRiskOrder,
} from "@/data/overview";

const SLA_PAGE_SIZE = 5;

const SLA_COLUMNS: TableColumn<SlaRiskOrder>[] = [
  { key: "id", header: "Mã đơn", render: (row) => row.id, cellClassName: "text-xs font-medium text-gray-900", headerClassName: "w-[109px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700", headerClassName: "w-[149px]" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "text-xs text-gray-700", headerClassName: "w-[169px]" },
  { key: "deadline", header: "Mốc giao hẹn", render: (row) => row.deadline, cellClassName: "text-xs text-gray-700", headerClassName: "w-[139px]" },
  { key: "risk", header: "Nguy cơ", render: (row) => row.risk, cellClassName: "text-xs text-red-700", headerClassName: "w-[299px]" },
  { key: "action", header: "Hành động gợi ý", render: (row) => row.action, cellClassName: "text-xs text-gray-700", headerClassName: "w-[288px]" },
];

export default function OverviewPage() {
  const [slaPage, setSlaPage] = useState(1);
  const slaTotalPages = Math.ceil(SLA_RISK_ORDERS.length / SLA_PAGE_SIZE);
  const slaRows = SLA_RISK_ORDERS.slice((slaPage - 1) * SLA_PAGE_SIZE, slaPage * SLA_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Tổng quan điều hành</h1>

      <section aria-label="Chỉ số hôm nay" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {OVERVIEW_KPIS.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Luồng đơn hàng" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Luồng đơn hàng - 9 trạng thái</h2>
        <div className="flex gap-2">
          {ORDER_FLOW_STATES.map((state) => (
            <div
              key={state.label}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-3 text-center ${
                state.highlight ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className={`text-xl font-semibold ${state.highlight ? "text-red-700" : "text-gray-900"}`}>{state.count}</p>
              <p className="text-[11px] text-gray-700">{state.label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 xl:flex-row">
        <section aria-label="Hàng đợi duyệt" className="flex min-w-0 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 xl:w-[58.6%]">
          <h2 className="text-sm font-semibold text-gray-900">Chờ duyệt (8) - con người quyết, hệ thống không tự quyết</h2>
          {APPROVAL_QUEUE.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[13px] text-gray-700">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900">{item.count}</p>
              <Link href="/hang-doi-duyet" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
                Xem hàng đợi
              </Link>
            </div>
          ))}
        </section>

        <section aria-label="Rào chắn backend" className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Rào chắn backend hôm nay (6)</h2>
          {GUARDRAIL_BLOCKS.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[13px] text-gray-700">{item.label}</p>
              <p className="text-sm font-semibold text-red-700">{item.count}</p>
            </div>
          ))}
        </section>
      </div>

      <section aria-label="Đơn quá SLA" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Đơn quá SLA / có nguy cơ trễ (7)
        </h2>
        <Table bare columns={SLA_COLUMNS} rows={slaRows} rowKey={(row) => row.id} />
        <div className="border-t border-gray-200">
          <Pagination
            page={slaPage}
            totalPages={slaTotalPages}
            onPageChange={setSlaPage}
            range={{
              end: Math.min(slaPage * SLA_PAGE_SIZE, SLA_RISK_ORDERS.length),
              start: (slaPage - 1) * SLA_PAGE_SIZE + 1,
              total: SLA_RISK_ORDERS.length,
            }}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 xl:flex-row">
        <section aria-label="Lớp BI" className="flex min-w-0 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 xl:w-[58.6%]">
          <h2 className="text-sm font-semibold text-gray-900">Lớp BI - 3 bất thường cần quyết</h2>
          {BI_ANOMALIES.map((item) => (
            <div key={item.title} className="flex flex-col gap-1">
              <p className="text-[13px] font-medium text-gray-900">{item.title}</p>
              <p className="text-xs text-gray-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <section aria-label="DX-Score" className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-gray-900">DX-Score (đo từ log)</h2>
            <p className="text-base font-semibold text-red-700">{DX_SCORE_TOTAL}</p>
          </div>
          {DX_AXES.map((axis) => (
            <div key={axis.key} className="flex items-center gap-2">
              <p className="text-xs text-gray-700">{axis.key}</p>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-red-700" style={{ width: `${axis.percent}%` }} />
              </div>
              <p className="whitespace-nowrap text-xs font-semibold text-gray-900">{axis.value}</p>
              <p className="whitespace-nowrap text-xs text-gray-500">tối đa 30%</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

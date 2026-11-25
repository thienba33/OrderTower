// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import Link from "next/link";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import type {
  BiWarningRow,
  FleetDriverRow,
  FleetVehicleRow,
  LowStockRow,
  LowTrustRow,
  MyCallRow,
  MyWorkRow,
  OpenTicketRow,
  OverviewView,
  SlaRiskRow,
} from "./overview-types";

const SLA_PAGE_SIZE = 5;
const LOW_TRUST_PAGE_SIZE = 5;

const SLA_COLUMNS: TableColumn<SlaRiskRow>[] = [
  { key: "id", header: "Mã đơn", render: (row) => row.id, cellClassName: "text-xs font-medium text-gray-900", headerClassName: "w-[109px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700", headerClassName: "w-[149px]" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "text-xs text-gray-700", headerClassName: "w-[169px]" },
  { key: "deadline", header: "Mốc giao hẹn", render: (row) => row.deadline, cellClassName: "text-xs text-gray-700", headerClassName: "w-[139px]" },
  { key: "risk", header: "Nguy cơ", render: (row) => row.risk, cellClassName: "text-xs text-red-700", headerClassName: "w-[299px]" },
  { key: "action", header: "Hành động gợi ý", render: (row) => row.action, cellClassName: "text-xs text-gray-700", headerClassName: "w-[288px]" },
];

const LOW_TRUST_COLUMNS: TableColumn<LowTrustRow>[] = [
  { key: "id", header: "Mã đơn", render: (row) => row.id, cellClassName: "text-xs font-medium text-gray-900" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700" },
  { key: "trust", header: "Độ tin cậy", render: (row) => `${row.trust}/100`, cellClassName: "text-xs font-medium text-red-700" },
  { key: "deadline", header: "Mốc giao hẹn", render: (row) => row.deadline, cellClassName: "text-xs text-gray-700" },
];

const MY_WORK_COLUMNS: TableColumn<MyWorkRow>[] = [
  { key: "orderId", header: "Mã đơn", render: (row) => row.orderId, cellClassName: "text-xs font-medium text-gray-900" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700" },
  { key: "orderState", header: "Trạng thái đơn", render: (row) => row.orderState, cellClassName: "text-xs text-gray-700" },
  { key: "status", header: "Phân đơn", render: (row) => row.status, cellClassName: "text-xs text-gray-700" },
];

const LOW_STOCK_COLUMNS: TableColumn<LowStockRow>[] = [
  { key: "sku", header: "SKU", render: (row) => row.sku, cellClassName: "text-xs font-medium text-gray-900" },
  { key: "name", header: "Tên hàng", render: (row) => row.name, cellClassName: "text-xs text-gray-700" },
  { key: "stock", header: "Tồn kho", render: (row) => `${row.stock} ${row.unit}`, cellClassName: "text-xs font-medium text-red-700" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "text-xs text-gray-700" },
];

const MY_CALL_COLUMNS: TableColumn<MyCallRow>[] = [
  { key: "orderId", header: "Mã đơn", render: (row) => row.orderId, cellClassName: "text-xs font-medium text-gray-900" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "text-xs text-gray-700" },
];

const TICKET_COLUMNS: TableColumn<OpenTicketRow>[] = [
  { key: "id", header: "Mã ticket", render: (row) => row.id, cellClassName: "text-xs font-medium text-gray-900" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "text-xs text-gray-700" },
  { key: "orderId", header: "Mã đơn", render: (row) => row.orderId, cellClassName: "text-xs text-gray-700" },
  { key: "type", header: "Loại", render: (row) => row.type, cellClassName: "text-xs text-gray-700" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "text-xs text-gray-700" },
];

// Tổng quan là trang chủ của từng role: mục nào là null trong view thì
// ẩn hẳn, chỉ hiện mục phục vụ công việc của role đó.
export default function OverviewClient({ view }: { view: OverviewView }) {
  const [slaPage, setSlaPage] = useState(1);
  const [lowTrustPage, setLowTrustPage] = useState(1);

  const slaList = view.slaRows ?? [];
  const slaTotalPages = Math.max(1, Math.ceil(slaList.length / SLA_PAGE_SIZE));
  const slaSafePage = Math.min(slaPage, slaTotalPages);
  const slaRows = slaList.slice((slaSafePage - 1) * SLA_PAGE_SIZE, slaSafePage * SLA_PAGE_SIZE);

  const lowTrustList = view.lowTrustRows ?? [];
  const lowTrustTotalPages = Math.max(1, Math.ceil(lowTrustList.length / LOW_TRUST_PAGE_SIZE));
  const lowTrustSafePage = Math.min(lowTrustPage, lowTrustTotalPages);
  const lowTrustRows = lowTrustList.slice(
    (lowTrustSafePage - 1) * LOW_TRUST_PAGE_SIZE,
    lowTrustSafePage * LOW_TRUST_PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Tổng quan điều hành</h1>

      {view.loadWarnings.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Không tải được: {view.loadWarnings.join("; ")}. Thử tải lại trang.
        </p>
      )}

      {view.kpis !== null && view.kpis.length > 0 && (
        <section aria-label="Chỉ số hôm nay" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {view.kpis.map((kpi) => (
            <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
            </div>
          ))}
        </section>
      )}

      {view.flowStates !== null && (
        <section aria-label="Luồng đơn hàng" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Luồng đơn hàng - 9 trạng thái</h2>
          <div className="flex gap-2">
            {view.flowStates.map((state) => (
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
      )}

      {(view.approvalRows !== null || view.guardrailRows !== null) && (
        <div className="flex flex-col gap-3 xl:flex-row">
          {view.approvalRows !== null && (
            <section aria-label="Hàng đợi duyệt" className="flex min-w-0 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 xl:w-[58.6%]">
              <h2 className="text-sm font-semibold text-gray-900">Chờ duyệt ({view.pendingTotal}) - con người quyết, hệ thống không tự quyết</h2>
              {view.approvalRows.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13px] text-gray-700">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-900">{item.count}</p>
                  <Link href="/approval-queue" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
                    Xem hàng đợi
                  </Link>
                </div>
              ))}
            </section>
          )}

          {view.guardrailRows !== null && (
            <section aria-label="Rào chắn backend" className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Rào chắn backend hôm nay ({view.guardrailTotal})</h2>
              {view.guardrailRows.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13px] text-gray-700">{item.label}</p>
                  <p className="text-sm font-semibold text-red-700">{item.count}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {view.dxSummary !== null && (
        <section aria-label="DX-Score" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">DX-Score (đo từ log) - {view.dxSummary.total}/100</h2>
            <Link href="/bi-dx-score" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem BI và DX-Score
            </Link>
          </div>
          <div className="flex gap-2">
            {([
              ["P - Quy trình", view.dxSummary.p],
              ["D - Dữ liệu", view.dxSummary.d],
              ["I - Trí tuệ", view.dxSummary.i],
              ["H - Con người", view.dxSummary.h],
            ] as const).map(([label, score]) => (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-1 py-3 text-center">
                <p className="text-xl font-semibold text-gray-900">{score}</p>
                <p className="text-[11px] text-gray-700">{label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {view.biWarnings !== null && (
        <section aria-label="Cảnh báo BI chưa xử lý" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Cảnh báo BI chưa xử lý ({view.biWarnings.length})</h2>
            <Link href="/bi-dx-score" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem màn BI
            </Link>
          </div>
          {view.biWarnings.length === 0 ? (
            <p className="text-sm text-gray-700">Không có cảnh báo BI chưa xử lý.</p>
          ) : (
            view.biWarnings.map((warning: BiWarningRow) => (
              <div key={warning.key} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[13px] font-medium text-gray-900">{warning.title}</p>
                <p className="text-xs text-gray-700">{warning.detail}</p>
              </div>
            ))
          )}
        </section>
      )}

      {view.slaRows !== null && (
        <section aria-label="Đơn quá SLA" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
            Đơn quá SLA / có nguy cơ trễ ({slaList.length})
          </h2>
          <Table bare columns={SLA_COLUMNS} rows={slaRows} rowKey={(row) => row.id} emptyText="Không có đơn quá SLA / có nguy cơ trễ." />
          <div className="border-t border-gray-200">
            <Pagination
              page={slaSafePage}
              totalPages={slaTotalPages}
              onPageChange={setSlaPage}
              range={{
                end: Math.min(slaSafePage * SLA_PAGE_SIZE, slaList.length),
                start: slaList.length === 0 ? 0 : (slaSafePage - 1) * SLA_PAGE_SIZE + 1,
                total: slaList.length,
              }}
            />
          </div>
        </section>
      )}

      {view.lowTrustRows !== null && (
        <section aria-label="Địa chỉ tin cậy thấp" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex h-11 items-center justify-between border-b border-gray-200 px-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Địa chỉ tin cậy thấp chờ xác nhận ({lowTrustList.length})
            </h2>
            <Link href="/address-split" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem phân tách địa chỉ
            </Link>
          </div>
          <Table bare columns={LOW_TRUST_COLUMNS} rows={lowTrustRows} rowKey={(row) => row.id} emptyText="Không có đơn địa chỉ tin cậy thấp." />
          <div className="border-t border-gray-200">
            <Pagination
              page={lowTrustSafePage}
              totalPages={lowTrustTotalPages}
              onPageChange={setLowTrustPage}
              range={{
                end: Math.min(lowTrustSafePage * LOW_TRUST_PAGE_SIZE, lowTrustList.length),
                start: lowTrustList.length === 0 ? 0 : (lowTrustSafePage - 1) * LOW_TRUST_PAGE_SIZE + 1,
                total: lowTrustList.length,
              }}
            />
          </div>
        </section>
      )}

      {view.fleetVehicles !== null && view.fleetDrivers !== null && (
        <div className="flex flex-col gap-3 xl:flex-row">
          <section aria-label="Xe sẵn sàng" className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Xe sẵn sàng ({view.fleetVehicles.length})</h2>
            {view.fleetVehicles.length === 0 ? (
              <p className="text-sm text-gray-700">Không có xe sẵn sàng.</p>
            ) : (
              view.fleetVehicles.map((vehicle: FleetVehicleRow) => (
                <div key={vehicle.id} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-gray-900">{vehicle.plate}</p>
                  <p className="text-xs text-gray-700">{vehicle.type}</p>
                </div>
              ))
            )}
          </section>

          <section aria-label="Tài xế sẵn sàng" className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Tài xế sẵn sàng ({view.fleetDrivers.length})</h2>
            {view.fleetDrivers.length === 0 ? (
              <p className="text-sm text-gray-700">Không có tài xế sẵn sàng.</p>
            ) : (
              view.fleetDrivers.map((driver: FleetDriverRow) => (
                <div key={driver.id} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-gray-900">{driver.name}</p>
                  <p className="text-xs text-gray-700">{driver.phone}</p>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {view.myWork !== null && (
        <section aria-label="Việc của tôi" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Việc của tôi - đang chờ ({view.myWork.waiting}), đang đóng gói ({view.myWork.packing})</h2>
            <Link href="/warehouse" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem hàng đợi kho
            </Link>
          </div>
          <Table bare columns={MY_WORK_COLUMNS} rows={view.myWork.rows} rowKey={(row) => row.orderId} emptyText="Không có đơn nào được giao cho bạn." />
        </section>
      )}

      {view.lowStock !== null && (
        <section aria-label="SKU sắp hết hàng" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">SKU sắp hết hàng ({view.lowStock.total})</h2>
            <Link href="/warehouse" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem tồn kho
            </Link>
          </div>
          <Table bare columns={LOW_STOCK_COLUMNS} rows={view.lowStock.rows} rowKey={(row) => row.sku} emptyText="Không có SKU sắp hết hàng." />
          {view.lowStock.total > view.lowStock.rows.length && (
            <p className="text-xs text-gray-700">
              Hiện 5 SKU tồn thấp nhất, còn {view.lowStock.total - view.lowStock.rows.length} SKU sắp hết nữa.
            </p>
          )}
        </section>
      )}

      {view.myCalls !== null && (
        <section aria-label="Cuộc gọi của tôi" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Cuộc gọi của tôi - chờ xử lý ({view.myCalls.waiting}), đang xử lý ({view.myCalls.inProgress})</h2>
            <Link href="/customer-care" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem chăm sóc khách hàng
            </Link>
          </div>
          <Table bare columns={MY_CALL_COLUMNS} rows={view.myCalls.rows} rowKey={(row) => row.orderId} emptyText="Không có cuộc gọi nào được giao cho bạn." />
        </section>
      )}

      {view.myTickets !== null && (
        <section aria-label="Ticket đang mở" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Ticket đang mở - mới ({view.myTickets.fresh}), đang xử lý ({view.myTickets.inProgress}), chờ khách ({view.myTickets.waitingCustomer})
            </h2>
            <Link href="/customer-care" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem chăm sóc khách hàng
            </Link>
          </div>
          <Table bare columns={TICKET_COLUMNS} rows={view.myTickets.rows} rowKey={(row) => row.id} emptyText="Không có ticket đang mở." />
        </section>
      )}

      {view.pendingReturns !== null && (
        <section aria-label="Hoàn hàng chờ xử lý" className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Đơn hoàn hàng chờ xử lý ({view.pendingReturns})</h2>
            <Link href="/customer-care" className="whitespace-nowrap text-xs font-medium text-red-700 underline">
              Xem chăm sóc khách hàng
            </Link>
          </div>
          {view.pendingReturns === 0 && (
            <p className="text-sm text-gray-700">Không có đơn hoàn hàng chờ xử lý.</p>
          )}
        </section>
      )}
    </div>
  );
}

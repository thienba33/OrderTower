// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import { WORKFLOW_STATUS_PILL, type AuditResult } from "@/data/admin";
import type { AdminView } from "./admin-types";
import type { ApiAuditRecord, ApiWorkflowDefinition } from "../orders/[id]/order-detail-types";

const PAGE_SIZE = 6;
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

// Tên hiển thị của định nghĩa luồng. API chỉ trả definitionId, không có
// trường tên riêng; order-flow là luồng đơn hàng duy nhất hiện có.
function definitionName(definitionId: string): string {
  return definitionId === "order-flow" ? "Luồng đơn hàng" : definitionId;
}

// Kết quả suy ra từ action, vì API không trả trường kết quả riêng:
// action kết thúc ".denied" -> bị từ chối; approval.approved -> đã duyệt;
// approval.rejected -> bị từ chối; approval.requested -> chờ duyệt;
// còn lại -> thành công.
function auditResult(action: string): AuditResult {
  if (action === "approval.approved") return "Đã duyệt";
  if (action === "approval.rejected") return "Bị từ chối";
  if (action === "approval.requested") return "Chờ duyệt";
  if (action.endsWith(".denied")) return "Bị từ chối";
  return "Thành công";
}

// ISO -> "DD/MM HH:mm" giờ Việt Nam, sai thì "-".
function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

const workflowColumns: TableColumn<ApiWorkflowDefinition>[] = [
  { key: "definitionId", header: "Mã", render: (row) => <span className="font-medium text-gray-900">{row.definitionId}</span>, cellClassName: "w-[139px]" },
  { key: "name", header: "Luồng", render: (row) => <span className="font-medium text-gray-900">{definitionName(row.definitionId)}</span>, cellClassName: "w-[219px]" },
  { key: "version", header: "Phiên bản", render: (row) => `v${row.version}`, cellClassName: "w-[119px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: () => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${WORKFLOW_STATUS_PILL["Đang chạy"]}`}>
        Đang chạy
      </span>
    ),
    cellClassName: "w-[159px]",
  },
  { key: "approver", header: "Người duyệt", render: () => "-", cellClassName: "w-[179px]" },
  { key: "appliedDate", header: "Ngày áp dụng", render: () => "-", cellClassName: "w-[159px]" },
  { key: "rollback", header: "Quay lui", render: () => "Có", cellClassName: "w-[199px]" },
];

const auditColumns: TableColumn<ApiAuditRecord>[] = [
  { key: "time", header: "Thời gian", render: (row) => formatShortDateTime(row.at), cellClassName: "w-[139px]" },
  { key: "user", header: "Người dùng", render: (row) => `${row.actor} (${row.role})`, cellClassName: "w-[199px]" },
  { key: "action", header: "Hành động", render: (row) => row.action, cellClassName: "w-[239px]" },
  { key: "target", header: "Đối tượng", render: (row) => row.orderId, cellClassName: "w-[199px]" },
  { key: "result", header: "Kết quả", render: (row) => auditResult(row.action), cellClassName: "w-[129px]" },
  {
    key: "hash",
    header: "Hash",
    render: (row) => <span className="break-all text-xs text-gray-700">{row.hash}</span>,
    cellClassName: "w-[278px]",
  },
];

export default function AdminClient({ view }: { view: AdminView }) {
  const [auditPage, setAuditPage] = useState(1);

  // Audit xếp theo seq tăng dần, bản ghi mới nhất xuống cuối.
  const auditRows = useMemo(
    () => [...view.audit].sort((a, b) => a.seq - b.seq),
    [view.audit],
  );
  const auditTotalPages = Math.max(1, Math.ceil(auditRows.length / PAGE_SIZE));
  const safePage = Math.min(auditPage, auditTotalPages);
  const auditPageRows = auditRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Quản trị hệ thống</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Phiên bản Workflow</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{view.definitions.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Audit hôm nay</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{view.auditToday}</p>
        </div>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Người dùng và phân quyền</h2>
        <p className="mt-2 text-[13px] text-gray-700">
          Tài khoản người dùng quản lý trong Keycloak Admin Console.
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Định nghĩa Workflow (tệp có phiên bản, engine đọc tệp để quyết định)</h2>
        </div>
        <Table
          columns={workflowColumns}
          rows={view.definitions}
          rowKey={(row) => row.definitionId}
          emptyText="Chưa có định nghĩa luồng nào"
          bare
        />
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Audit log (chỉ ghi thêm, hash nối chuỗi)</h2>
        </div>
        <p
          className={`border-b border-gray-200 px-4 py-3 text-sm ${
            view.verify === null
              ? "text-gray-500"
              : view.verify.valid
                ? "font-medium text-green-700"
                : "font-medium text-red-700"
          }`}
        >
          {view.verify === null
            ? "Chưa kiểm tra được chuỗi hash."
            : view.verify.valid
              ? `Chuỗi hash hợp lệ (đã kiểm tra ${view.verify.checked} bản ghi).`
              : `Chuỗi hash KHÔNG hợp lệ, hỏng tại bản ghi số ${view.verify.brokenAt}.`}
        </p>
        <Table
          columns={auditColumns}
          rows={auditPageRows}
          rowKey={(row) => String(row.seq)}
          emptyText="Không có bản ghi audit nào"
          bare
        />
        <Pagination
          page={safePage}
          totalPages={auditTotalPages}
          onPageChange={setAuditPage}
          range={{
            start: auditRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1,
            end: Math.min(safePage * PAGE_SIZE, auditRows.length),
            total: auditRows.length,
          }}
        />
      </section>
    </div>
  );
}

"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatMoney } from "@/data/orders";
import {
  WAREHOUSE_STATUSES,
  WAREHOUSE_STATUS_PILL,
  inventoryStatus,
  type ApiInventoryItem,
  type PackingQueueError,
  type WarehouseRow,
} from "./warehouse-types";
import type {
  ApiAssignment,
  AssignmentStatus,
} from "../customer-care/customer-care-types";
import type { ApiOrder } from "../orders/orders-types";

const PAGE_SIZE = 6;
const QUEUE_PAGE_SIZE = 5;

const ACTIVE_QUEUE_STATUSES: AssignmentStatus[] = ["Chờ xử lý", "Đang xử lý"];

const QUEUE_STATUS_PILL: Record<AssignmentStatus, string> = {
  "Chờ xử lý": "bg-amber-50 text-amber-800",
  "Đang xử lý": "bg-green-50 text-green-700",
  "Hoàn thành": "bg-blue-50 text-blue-700",
  "Đã hủy": "bg-gray-50 text-gray-700",
};

interface PackingQueueRow {
  assignment: ApiAssignment;
  order: ApiOrder | null;
}

interface WarehouseClientProps {
  items: ApiInventoryItem[];
  myAssignments: ApiAssignment[];
  myOrders: ApiOrder[];
  queueError: PackingQueueError | null;
  showQueue: boolean;
  username: string;
  roles: string[];
}

// Vai được nhập thêm hàng vào kho (khớp INVENTORY_WRITE_ROLES ở API):
// nhân viên kho, quản lý, quản trị viên. Điều phối viên xem được màn kho
// nhưng không thấy form nhập hàng.
const RESTOCK_ROLES = ["Quản trị viên", "Quản lý", "Nhân viên kho"];

function toRow(item: ApiInventoryItem): WarehouseRow {
  return { ...item, status: inventoryStatus(item), total: item.stock + item.reserved };
}

const warehouseColumns: TableColumn<WarehouseRow>[] = [
  { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[109px]" },
  { key: "name", header: "Sản phẩm", render: (row) => row.name, cellClassName: "w-[218px]" },
  { key: "unit", header: "Đơn vị", render: (row) => row.unit, cellClassName: "w-[89px]" },
  { key: "unitPrice", header: "Đơn giá", render: (row) => (row.unitPrice === null ? "-" : formatMoney(row.unitPrice)), cellClassName: "w-[109px]" },
  { key: "stock", header: "Tồn kho", render: (row) => String(row.stock), cellClassName: "w-[89px]" },
  { key: "reserved", header: "Đã giữ", render: (row) => String(row.reserved), cellClassName: "w-[89px]" },
  { key: "total", header: "Tổng", render: (row) => String(row.total), cellClassName: "w-[89px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${WAREHOUSE_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[149px]",
  },
];

export default function WarehouseClient({
  items,
  myAssignments,
  myOrders,
  queueError,
  showQueue,
  username,
  roles,
}: WarehouseClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSku, setSelectedSku] = useState<string | null>(items[0]?.sku ?? null);
  const canRestock = roles.some((role) => RESTOCK_ROLES.includes(role));
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockReason, setRestockReason] = useState("");
  const [restockBusy, setRestockBusy] = useState(false);
  const [restockError, setRestockError] = useState("");
  const [restockDone, setRestockDone] = useState("");

  // Hàng đợi phân đơn của nhân viên kho đang đăng nhập: phân đơn kho
  // đang hoạt động, mới nhất lên trước. Đơn không tìm thấy (không bao
  // giờ bị xóa) thì vẫn hiện phân đơn với trạng thái đơn là "-".
  const myQueue = useMemo<PackingQueueRow[]>(() => {
    const orderById = new Map(myOrders.map((order) => [order.id, order]));
    return myAssignments
      .filter(
        (item) =>
          item.kind === "warehouse" &&
          item.assignedTo === username &&
          ACTIVE_QUEUE_STATUSES.includes(item.status),
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .map((assignment) => ({
        assignment,
        order: orderById.get(assignment.orderId) ?? null,
      }));
  }, [myAssignments, myOrders, username]);

  const [queuePage, setQueuePage] = useState(1);
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null);
  const [queueErrorText, setQueueErrorText] = useState("");

  const queueTotalPages = Math.max(
    1,
    Math.ceil(myQueue.length / QUEUE_PAGE_SIZE),
  );
  const queueSafePage = Math.min(queuePage, queueTotalPages);
  const queuePaged = myQueue.slice(
    (queueSafePage - 1) * QUEUE_PAGE_SIZE,
    queueSafePage * QUEUE_PAGE_SIZE,
  );
  const queueRange =
    myQueue.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (queueSafePage - 1) * QUEUE_PAGE_SIZE + 1,
          end: Math.min(queueSafePage * QUEUE_PAGE_SIZE, myQueue.length),
          total: myQueue.length,
        };

  // Bắt đầu hoặc hoàn thành phân đơn qua route nội bộ; lỗi hiện message
  // của API, xong thì tải lại dữ liệu server.
  const submitQueueAction = async (
    assignmentId: string,
    action: "start" | "complete",
  ) => {
    setQueueBusyId(`${action}-${assignmentId}`);
    setQueueErrorText("");
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setQueueErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác lỗi (${response.status}).`,
        );
        return;
      }
      router.refresh();
    } catch {
      setQueueErrorText("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setQueueBusyId(null);
    }
  };

  // Nhập thêm hàng cho SKU đang chọn: số lượng phải là số nguyên dương
  // (API cũng chặn). Xong thì tải lại dữ liệu server để tồn kho mới hiện.
  const submitRestock = async () => {
    if (selectedSku === null) {
      return;
    }
    const quantity = Number(restockQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setRestockError("Số lượng nhập phải là số nguyên dương.");
      setRestockDone("");
      return;
    }
    setRestockBusy(true);
    setRestockError("");
    setRestockDone("");
    try {
      const response = await fetch(
        `/api/inventory/${encodeURIComponent(selectedSku)}/restock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            restockReason.trim() === ""
              ? { quantity }
              : { quantity, reason: restockReason.trim() },
          ),
        },
      );
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setRestockError(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác lỗi (${response.status}).`,
        );
        return;
      }
      setRestockQuantity("");
      setRestockReason("");
      setRestockDone(`Đã nhập thêm ${quantity} đơn vị vào kho.`);
      router.refresh();
    } catch {
      setRestockError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setRestockBusy(false);
    }
  };

  const queueColumns: TableColumn<PackingQueueRow>[] = [
    {
      key: "id",
      header: "Mã đơn",
      render: (row) => (
        <span className="font-medium text-gray-900">{row.assignment.orderId}</span>
      ),
      cellClassName: "w-[109px]",
    },
    {
      key: "state",
      header: "Trạng thái đơn",
      render: (row) => row.order?.state ?? "-",
      cellClassName: "w-[149px]",
    },
    {
      key: "items",
      header: "Sản phẩm",
      render: (row) => {
        const item = row.order?.items[0];
        return item === undefined ? "-" : `${item.sku} x${item.quantity}`;
      },
      cellClassName: "w-[179px]",
    },
    {
      key: "status",
      header: "Trạng thái phân đơn",
      render: (row) => (
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${QUEUE_STATUS_PILL[row.assignment.status]}`}
        >
          {row.assignment.status}
        </span>
      ),
      cellClassName: "w-[139px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.assignment.status === "Chờ xử lý" && (
            <button
              type="button"
              disabled={queueBusyId !== null}
              onClick={() => void submitQueueAction(row.assignment.id, "start")}
              className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {queueBusyId === `start-${row.assignment.id}` ? "Đang bắt đầu..." : "Bắt đầu"}
            </button>
          )}
          {row.assignment.status === "Đang xử lý" && (
            <button
              type="button"
              disabled={queueBusyId !== null}
              onClick={() => void submitQueueAction(row.assignment.id, "complete")}
              className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {queueBusyId === `complete-${row.assignment.id}` ? "Đang hoàn thành..." : "Hoàn thành"}
            </button>
          )}
          <Link
            href={`/orders/${row.assignment.orderId}`}
            className="text-xs font-medium text-red-700 underline"
          >
            Xem đơn
          </Link>
        </span>
      ),
      cellClassName: "w-[219px]",
    },
  ];

  const rows = useMemo(() => items.map(toRow), [items]);

  const counts = useMemo(() => {
    const count = (status: WarehouseRow["status"]) => rows.filter((row) => row.status === status).length;
    return {
      total: rows.length,
      low: count("Sắp hết"),
      out: count("Hết hàng"),
      stock: rows.reduce((sum, row) => sum + row.stock, 0),
      reserved: rows.reduce((sum, row) => sum + row.reserved, 0),
    };
  }, [rows]);

  // Các SKU sắp hết hoặc hết hàng; SKU thấp nhất là SKU có tồn kho thấp nhất.
  const lowRows = useMemo(
    () => rows.filter((row) => row.status === "Sắp hết" || row.status === "Hết hàng"),
    [rows],
  );
  const lowest = useMemo(
    () =>
      lowRows.reduce<WarehouseRow | null>(
        (min, row) => (min === null || row.stock < min.stock ? row : min),
        null,
      ),
    [lowRows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (q && ![row.sku, row.name].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = rows.find((row) => row.sku === selectedSku) ?? rows[0] ?? null;

  const kpis = [
    { label: "Tổng SKU", value: counts.total },
    { label: "Sắp hết", value: counts.low },
    { label: "Hết hàng", value: counts.out },
    { label: "Tổng tồn khả dụng", value: counts.stock },
    { label: "Tổng đã giữ", value: counts.reserved },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Kho và tồn kho - Kho duy nhất</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      {showQueue && (
        <section aria-label="Đơn được phân công" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex h-11 items-center px-4">
            <p className="flex-1 text-sm font-semibold text-gray-900">
              Đơn được phân công - Việc của tôi
            </p>
            <p className="text-xs text-gray-500">
              Chuyển trạng thái đóng gói (Chờ kho -&gt; Đang đóng gói -&gt; Chờ
              điều xe) thực hiện ở chi tiết đơn.
            </p>
          </div>
          {queueError !== null ? (
            <p className="border-t border-gray-200 px-4 py-6 text-sm text-gray-700">
              {queueError === "unauthorized" ? (
                <>
                  Phiên đăng nhập đã hết hạn.{" "}
                  <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                    Đăng nhập lại
                  </Link>{" "}
                  để xem đơn được phân công từ API.
                </>
              ) : (
                "Không tải được đơn được phân công. Tải lại trang để thử lại."
              )}
            </p>
          ) : (
            <>
              <Table
                bare
                columns={queueColumns}
                rows={queuePaged}
                rowKey={(row) => row.assignment.id}
                emptyText="Chưa có đơn nào được phân công cho bạn"
              />
              <div className="border-t border-gray-200">
                <Pagination
                  page={queueSafePage}
                  totalPages={queueTotalPages}
                  onPageChange={setQueuePage}
                  range={queueRange}
                />
              </div>
              {queueErrorText !== "" && (
                <p className="border-t border-gray-200 px-4 py-3 text-sm text-red-700">
                  {queueErrorText}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {lowRows.length > 0 && lowest !== null && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="flex-1 text-sm">
              <span className="font-bold text-red-800">
                CẢNH BÁO TỒN KHO: {lowRows.length} SKU sắp hết (thấp nhất: {lowest.sku} còn {lowest.stock} {lowest.unit}).
              </span>
              <span className="text-gray-500"> Chưa có đề xuất nhập tự động.</span>
            </p>
          </div>
          <div className="h-[3px] w-full bg-red-600" />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm SKU, tên sản phẩm..."
            aria-label="Tìm SKU, tên sản phẩm"
            className="h-10 w-[340px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Trạng thái tồn"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả trạng thái tồn</option>
            {WAREHOUSE_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }}
            className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Danh sách tồn kho theo SKU</p>
        </div>
        <Table
          columns={[
            ...warehouseColumns,
            {
              key: "action",
              header: "Hành động",
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelectedSku(row.sku)}
                  className="text-xs font-medium text-red-700 underline"
                >
                  Chi tiết
                </button>
              ),
              cellClassName: "w-[99px]",
            },
          ]}
          rows={pageRows}
          rowKey={(row) => row.sku}
          emptyText="Không có SKU nào khớp bộ lọc"
          bare
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          range={{ start: filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, end: Math.min(page * PAGE_SIZE, filtered.length), total: filtered.length }}
        />
      </div>

      {selected !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Chi tiết tồn kho: {selected.sku} - {selected.name}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Tồn kho hiện tại</p>
              <p className="text-sm font-semibold text-gray-900">{selected.stock} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Đã giữ cho đơn</p>
              <p className="text-sm font-semibold text-gray-900">{selected.reserved} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Tổng tồn</p>
              <p className="text-sm font-semibold text-gray-900">{selected.total} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Đơn giá</p>
              <p className="text-sm font-semibold text-gray-900">{selected.unitPrice === null ? "-" : formatMoney(selected.unitPrice)}</p>
            </div>
          </div>
          {canRestock && (
            <div className="flex flex-col gap-3 border-t border-gray-200 pt-3">
              <p className="text-sm font-semibold text-gray-900">Nhập thêm hàng</p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={restockQuantity}
                  onChange={(e) => setRestockQuantity(e.target.value)}
                  placeholder="Số lượng nhập"
                  aria-label="Số lượng nhập"
                  className="h-10 w-[160px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                />
                <input
                  type="text"
                  value={restockReason}
                  onChange={(e) => setRestockReason(e.target.value)}
                  placeholder="Lý do nhập (không bắt buộc)"
                  aria-label="Lý do nhập"
                  className="h-10 min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => void submitRestock()}
                  disabled={restockBusy}
                  className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {restockBusy ? "Đang nhập..." : "Nhập kho"}
                </button>
              </div>
              {restockError !== "" && (
                <p className="text-sm text-red-700">{restockError}</p>
              )}
              {restockDone !== "" && (
                <p className="text-sm text-green-700">{restockDone}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

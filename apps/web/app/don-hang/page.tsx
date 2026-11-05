"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ORDERS,
  ORDER_CHANNELS,
  ORDER_PRODUCTS,
  ORDER_STATUSES,
  ORDER_STATUS_PILL,
  ORDER_TRUST_TEXT,
  formatMoney,
  type Order,
  type OrderChannel,
  type OrderStatus,
} from "@/data/orders";

const PAGE_SIZE = 8;

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function SelectWithChevron({
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>(ORDERS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("2026-11-02");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["DH-1051", "DH-1041"]));
  const [bulkStatus, setBulkStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customer: "",
    phone: "",
    channel: "Chat" as OrderChannel,
    address: "",
    product: "NM-25",
    quantity: 2,
    note: "",
  });

  const kpis = useMemo(() => {
    const count = (status: OrderStatus) => orders.filter((order) => order.status === status).length;
    return [
      { label: "Tất cả đơn", value: orders.length },
      { label: "Mới tạo", value: count("Mới tạo") },
      { label: "Chờ kho", value: count("Chờ kho") },
      { label: "Đang giao", value: count("Đang giao") },
      { label: "Hoàn / Hủy", value: count("Hoàn") + count("Hủy") },
    ];
  }, [orders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s/g, "");
    const datePart =
      dateFilter === "" ? "" : `${dateFilter.slice(8, 10)}/${dateFilter.slice(5, 7)}`;
    return orders.filter((order) => {
      if (statusFilter !== "" && order.status !== statusFilter) {
        return false;
      }
      if (channelFilter !== "" && order.channel !== channelFilter) {
        return false;
      }
      if (datePart !== "" && !order.deadline.startsWith(datePart)) {
        return false;
      }
      if (query !== "") {
        const haystack = `${order.id}${order.customer}${order.phone}`.toLowerCase().replace(/\s/g, "");
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [orders, search, statusFilter, channelFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allPageSelected = pageRows.length > 0 && pageRows.every((order) => selected.has(order.id));
  const somePageSelected = pageRows.some((order) => selected.has(order.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRows.forEach((order) => next.delete(order.id));
      } else {
        pageRows.forEach((order) => next.add(order.id));
      }
      return next;
    });
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setChannelFilter("");
    setDateFilter("2026-11-02");
    setPage(1);
  };

  const applyBulk = () => {
    if (bulkStatus === "") {
      return;
    }
    setOrders((prev) =>
      prev.map((order) =>
        selected.has(order.id) ? { ...order, status: bulkStatus as OrderStatus } : order,
      ),
    );
    setSelected(new Set());
    setBulkStatus("");
  };

  const canCreate =
    form.customer.trim() !== "" && form.phone.trim() !== "" && form.address.trim() !== "";

  const createOrder = () => {
    if (!canCreate) {
      return;
    }
    const product = ORDER_PRODUCTS.find((item) => item.sku === form.product) ?? ORDER_PRODUCTS[0];
    const maxId = Math.max(...orders.map((order) => Number(order.id.slice(3))));
    const order: Order = {
      id: `DH-${maxId + 1}`,
      channel: form.channel,
      customer: form.customer.trim(),
      phone: form.phone.trim(),
      productSku: product.sku,
      quantity: form.quantity,
      total: product.unitPrice * form.quantity,
      status: "Mới tạo",
      deadline: "02/11 16:00",
      trust: "Cần lưu ý",
      address: form.address.trim(),
      note: form.note.trim() === "" ? undefined : form.note.trim(),
    };
    setOrders((prev) => [order, ...prev]);
    setForm({ customer: "", phone: "", channel: "Chat", address: "", product: "NM-25", quantity: 2, note: "" });
    setCreateOpen(false);
    setSearch("");
    setStatusFilter("");
    setChannelFilter("");
    setPage(1);
  };

  const columns: TableColumn<Order>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn trang này"
          checked={allPageSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = somePageSelected && !allPageSelected;
            }
          }}
          onChange={toggleAllPage}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${row.id}`}
          checked={selected.has(row.id)}
          onChange={() => toggleOne(row.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "id",
      header: "Mã đơn",
      render: (row) => row.id,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[99px]",
    },
    {
      key: "channel",
      header: "Kênh",
      render: (row) => row.channel,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[79px]",
    },
    {
      key: "customer",
      header: "Khách hàng",
      render: (row) => row.customer,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (row) => row.phone,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[119px]",
    },
    {
      key: "product",
      header: "Sản phẩm",
      render: (row) => `${row.productSku} x${row.quantity}`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[157px]",
    },
    {
      key: "total",
      header: "Tổng tiền",
      render: (row) => formatMoney(row.total),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[99px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${ORDER_STATUS_PILL[row.status]}`}
        >
          {row.status}
        </span>
      ),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[139px]",
    },
    {
      key: "deadline",
      header: "Mốc giao hẹn",
      render: (row) => row.deadline,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "trust",
      header: "Tin cậy ĐC",
      render: (row) => <span className={`text-xs ${ORDER_TRUST_TEXT[row.trust]}`}>{row.trust}</span>,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[99px]",
    },
    {
      key: "action",
      header: "Hành động",
      render: (row) => (
        <Link href={`/don-hang/${row.id}`} className="text-xs font-medium text-red-700 underline">
          Chi tiết
        </Link>
      ),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[99px]",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Đơn hàng</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
        >
          Tạo đơn mới
        </button>
      </div>

      <section aria-label="Chỉ số đơn hàng" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Bộ lọc đơn hàng" className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-[340px] max-w-full">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã đơn, SĐT, khách hàng..."
              aria-label="Tìm đơn hàng"
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-500"
            />
          </div>
          <SelectWithChevron
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            ariaLabel="Lọc theo trạng thái"
            className="w-[200px]"
          >
            <option value="">Tất cả trạng thái</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </SelectWithChevron>
          <SelectWithChevron
            value={channelFilter}
            onChange={(value) => {
              setChannelFilter(value);
              setPage(1);
            }}
            ariaLabel="Lọc theo kênh"
            className="w-[160px]"
          >
            <option value="">Tất cả kênh</option>
            {ORDER_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </SelectWithChevron>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo ngày"
            className="h-10 w-[170px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-9 items-center rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Xóa bộ lọc
          </button>
        </div>
      </section>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-800">Đã chọn {selected.size} đơn</p>
          <SelectWithChevron
            value={bulkStatus}
            onChange={setBulkStatus}
            ariaLabel="Chọn trạng thái mới cho các đơn đã chọn"
            className="w-[260px]"
          >
            <option value="">Chuyển trạng thái...</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </SelectWithChevron>
          <button
            type="button"
            disabled={bulkStatus === ""}
            onClick={applyBulk}
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Áp dụng
          </button>
        </div>
      )}

      <section aria-label="Danh sách đơn hàng" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Danh sách đơn hàng
        </h2>
        <Table
          bare
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.id}
          emptyText="Không có đơn nào khớp bộ lọc"
        />
        <div className="border-t border-gray-200">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            range={{
              end: Math.min(safePage * PAGE_SIZE, filtered.length),
              start: filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1,
              total: filtered.length,
            }}
          />
        </div>
      </section>

      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] font-semibold text-gray-900">
        Rào chắn backend (áp dụng cho mọi chuyển trạng thái)
      </p>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo đơn mới"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={createOrder}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tạo đơn
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Khách hàng">
            <input
              type="text"
              value={form.customer}
              onChange={(event) => setForm({ ...form, customer: event.target.value })}
              placeholder="KH mới - tên ẩn danh, ví dụ KH-071"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex gap-3">
            <Field label="SĐT" className="flex-1">
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="09xx xxx xxx"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Kênh" className="flex-1">
              <SelectWithChevron
                value={form.channel}
                onChange={(value) => setForm({ ...form, channel: value as OrderChannel })}
                ariaLabel="Chọn kênh"
                className="w-full"
              >
                {ORDER_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </SelectWithChevron>
            </Field>
          </div>
          <Field label="Địa chỉ giao hàng">
            <input
              type="text"
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              placeholder="Số nhà, ngõ, phố, quận/huyện, tỉnh/thành phố"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Sản phẩm" className="flex-1">
              <SelectWithChevron
                value={form.product}
                onChange={(value) => setForm({ ...form, product: value })}
                ariaLabel="Chọn sản phẩm"
                className="w-full"
              >
                {ORDER_PRODUCTS.map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.label}
                  </option>
                ))}
              </SelectWithChevron>
            </Field>
            <Field label="Số lượng" className="flex-1">
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: Math.max(1, Number(event.target.value) || 1) })
                }
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Ghi chú">
            <input
              type="text"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Mốc giao hẹn, yêu cầu đặc biệt..."
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ADDRESS_DISTRICTS,
  ADDRESS_PROVINCES,
  ADDRESS_WARDS,
  trustLevel,
  type AddressProvince,
} from "@/data/address-split";
import {
  ORDER_STATUSES,
  ORDER_STATUS_PILL,
  ORDER_TRUST_TEXT,
  formatMoney,
  type OrderStatus,
  type TrustLevel,
} from "@/data/orders";
import type { ApiChannel, ApiInventoryItem, ApiOrder } from "./orders-types";

const PAGE_SIZE = 8;

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500";

// Mốc giao hẹn ISO -> "DD/MM HH:mm" giờ Việt Nam, null hoặc sai thì "-".
function formatDeadline(iso: string | null): string {
  if (!iso) {
    return "-";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

// Ngày của mốc giao hẹn theo giờ Việt Nam, dạng yyyy-mm-dd để lọc.
function deadlineDatePart(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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

export default function OrdersClient({
  orders,
  channels,
  products,
}: {
  orders: ApiOrder[];
  channels: ApiChannel[];
  products: ApiInventoryItem[];
}) {
  const router = useRouter();
  // Chỉ sản phẩm có giá mới chọn được: tổng tiền đơn do server tính từ
  // giá tồn kho, SKU chưa có giá đóng góp 0.
  const pricedProducts = useMemo(
    () => products.filter((product) => product.unitPrice !== null),
    [products],
  );
  const defaultProduct = pricedProducts[0]?.sku ?? "";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer: "",
    phone: "",
    channel: "",
    province: "",
    district: "",
    ward: "",
    street: "",
    product: defaultProduct,
    quantity: 2,
    deadline: "",
  });

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of channels) {
      map.set(channel.id, channel.name);
    }
    return map;
  }, [channels]);

  const channelName = (order: ApiOrder): string =>
    order.channelId ? (channelNameById.get(order.channelId) ?? "-") : "-";

  const trustOf = (order: ApiOrder): TrustLevel | null => {
    if (order.addressLevel) {
      return order.addressLevel;
    }
    if (order.addressTrust === null) {
      return null;
    }
    return trustLevel(order.addressTrust);
  };

  const districts =
    form.province === ""
      ? []
      : (ADDRESS_DISTRICTS[form.province as AddressProvince] ?? []);
  const wards = form.district === "" ? [] : (ADDRESS_WARDS[form.district] ?? []);

  const kpis = useMemo(() => {
    const count = (status: OrderStatus) => orders.filter((order) => order.state === status).length;
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
    return orders.filter((order) => {
      if (statusFilter !== "" && order.state !== statusFilter) {
        return false;
      }
      if (channelFilter !== "") {
        const name = order.channelId
          ? (channelNameById.get(order.channelId) ?? "-")
          : "-";
        if (name !== channelFilter) {
          return false;
        }
      }
      if (dateFilter !== "" && deadlineDatePart(order.deadline) !== dateFilter) {
        return false;
      }
      if (query !== "") {
        const haystack = `${order.id}${order.customer}${order.phone ?? ""}`
          .toLowerCase()
          .replace(/\s/g, "");
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [orders, search, statusFilter, channelFilter, dateFilter, channelNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setChannelFilter("");
    setDateFilter("");
    setPage(1);
  };

  // Địa chỉ phải đủ tỉnh/quận/phường thì API mới chấm được tin cậy; số
  // nhà/đường và mốc giao hẹn không bắt buộc.
  const canCreate =
    form.customer.trim() !== "" &&
    form.phone.trim() !== "" &&
    form.province !== "" &&
    form.district !== "" &&
    form.ward !== "" &&
    form.product !== "";

  const resetForm = () => {
    setForm({
      customer: "",
      phone: "",
      channel: "",
      province: "",
      district: "",
      ward: "",
      street: "",
      product: defaultProduct,
      quantity: 2,
      deadline: "",
    });
    setError("");
  };

  const createOrder = async () => {
    if (!canCreate || submitting) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          customer: form.customer.trim(),
          phone: form.phone.trim(),
          items: [{ sku: form.product, quantity: form.quantity }],
          address: {
            province: form.province,
            district: form.district,
            ward: form.ward,
            ...(form.street.trim() !== "" ? { street: form.street.trim() } : {}),
          },
          ...(form.channel !== "" ? { channelId: form.channel } : {}),
          ...(form.deadline !== ""
            ? { deadline: new Date(form.deadline).toISOString() }
            : {}),
        }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setError(
          typeof message === "string" && message !== ""
            ? message
            : `Tạo đơn lỗi (${response.status}).`,
        );
        return;
      }
      resetForm();
      setCreateOpen(false);
      resetFilters();
      router.refresh();
    } catch {
      setError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn<ApiOrder>[] = [
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
      render: (row) => channelName(row),
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
      render: (row) => row.phone ?? "-",
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[119px]",
    },
    {
      key: "product",
      header: "Sản phẩm",
      render: (row) =>
        row.items.length > 0
          ? row.items.map((item) => `${item.sku} x${item.quantity}`).join(", ")
          : "-",
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
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${ORDER_STATUS_PILL[row.state as OrderStatus] ?? "bg-gray-50 text-gray-700"}`}
        >
          {row.state}
        </span>
      ),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[139px]",
    },
    {
      key: "deadline",
      header: "Mốc giao hẹn",
      render: (row) => formatDeadline(row.deadline),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "trust",
      header: "Tin cậy ĐC",
      render: (row) => {
        const trust = trustOf(row);
        return trust ? (
          <span className={`text-xs ${ORDER_TRUST_TEXT[trust]}`}>{trust}</span>
        ) : (
          "-"
        );
      },
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[99px]",
    },
    {
      key: "action",
      header: "Hành động",
      render: (row) => (
        <Link href={`/orders/${row.id}`} className="text-xs font-medium text-red-700 underline">
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
            {channels.map((channel) => (
              <option key={channel.id} value={channel.name}>
                {channel.name}
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
              disabled={!canCreate || submitting}
              onClick={createOrder}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Đang tạo..." : "Tạo đơn"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error !== "" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Field label="Khách hàng">
            <input
              type="text"
              value={form.customer}
              onChange={(event) => setForm({ ...form, customer: event.target.value })}
              placeholder="Tên khách hàng"
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
                onChange={(value) => setForm({ ...form, channel: value })}
                ariaLabel="Chọn kênh"
                className="w-full"
              >
                <option value="">Không chọn kênh</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </SelectWithChevron>
            </Field>
          </div>
          <Field label="Tỉnh/Thành phố">
            <SelectWithChevron
              value={form.province}
              onChange={(value) =>
                setForm({ ...form, province: value, district: "", ward: "" })
              }
              ariaLabel="Chọn tỉnh/thành phố"
              className="w-full"
            >
              <option value="">Chọn tỉnh/thành phố</option>
              {ADDRESS_PROVINCES.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </SelectWithChevron>
          </Field>
          <div className="flex gap-3">
            <Field label="Quận/Huyện" className="flex-1">
              <SelectWithChevron
                value={form.district}
                onChange={(value) => setForm({ ...form, district: value, ward: "" })}
                ariaLabel="Chọn quận/huyện"
                className="w-full"
              >
                <option value="">Chọn quận/huyện</option>
                {districts.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </SelectWithChevron>
            </Field>
            <Field label="Phường/Xã" className="flex-1">
              <SelectWithChevron
                value={form.ward}
                onChange={(value) => setForm({ ...form, ward: value })}
                ariaLabel="Chọn phường/xã"
                className="w-full"
              >
                <option value="">Chọn phường/xã</option>
                {wards.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward}
                  </option>
                ))}
              </SelectWithChevron>
            </Field>
          </div>
          <Field label="Số nhà, ngõ, phố">
            <input
              type="text"
              value={form.street}
              onChange={(event) => setForm({ ...form, street: event.target.value })}
              placeholder="Số nhà, ngõ, phố (không bắt buộc)"
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
                {pricedProducts.length === 0 && (
                  <option value="">Chưa có sản phẩm có giá</option>
                )}
                {pricedProducts.map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {`${product.sku} - ${product.name} - ${formatMoney(product.unitPrice ?? 0)}`}
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
          <Field label="Mốc giao hẹn">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(event) => setForm({ ...form, deadline: event.target.value })}
              aria-label="Chọn mốc giao hẹn"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

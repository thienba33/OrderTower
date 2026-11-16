// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Table, type TableColumn } from "@/components/ui/Table";
import { trustLevel } from "@/data/address-split";
import {
  ORDER_STATUS_PILL,
  ORDER_TRUST_TEXT,
  formatMoney,
  type OrderStatus,
  type TrustLevel,
} from "@/data/orders";
import type { ApiChannel, ApiInventoryItem } from "../orders-types";
import type {
  ApiAuditRecord,
  ApiOrderDetail,
  ApiWorkflowTransition,
} from "./order-detail-types";

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500";

// ISO -> "HH:mm" giờ Việt Nam, sai thì "-".
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

// ISO -> "DD/MM/YYYY HH:mm" giờ Việt Nam, null hoặc sai thì "-".
function formatDateTime(iso: string | null): string {
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

// ISO -> "DD/MM HH:mm" giờ Việt Nam, dùng cho bảng audit.
function formatShortDateTime(iso: string): string {
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

export default function OrderDetailClient({
  order,
  transitions,
  roles,
  audit,
  channels,
  products,
}: {
  order: ApiOrderDetail;
  transitions: ApiWorkflowTransition[];
  roles: string[];
  audit: ApiAuditRecord[];
  channels: ApiChannel[];
  products: ApiInventoryItem[];
}) {
  const router = useRouter();

  const channelName = useMemo(() => {
    if (!order.channelId) {
      return "-";
    }
    return channels.find((channel) => channel.id === order.channelId)?.name ?? "-";
  }, [order.channelId, channels]);

  const productBySku = useMemo(() => {
    const map = new Map<string, ApiInventoryItem>();
    for (const product of products) {
      map.set(product.sku, product);
    }
    return map;
  }, [products]);

  const trust: TrustLevel | null =
    order.addressLevel ?? (order.addressTrust === null ? null : trustLevel(order.addressTrust));

  const address = useMemo(() => {
    const parts = [
      order.address?.street,
      order.address?.ward,
      order.address?.district,
      order.address?.province,
    ].filter((part) => part !== undefined && part.trim() !== "");
    return parts.length > 0 ? parts.join(", ") : "-";
  }, [order.address]);

  const creator =
    order.history.length > 0
      ? `${order.history[0].by} (${order.history[0].role})`
      : "-";

  // Các chuyển đi ra từ trạng thái hiện tại mà vai của người gọi được làm.
  const options = useMemo(
    () =>
      transitions.filter(
        (transition) =>
          transition.from === order.state && roles.includes(transition.role),
      ),
    [transitions, order.state, roles],
  );
  const isClosed = order.state === "Hoàn" || order.state === "Hủy";

  const [nextTo, setNextTo] = useState("");
  const [reason, setReason] = useState("");
  const [handling, setHandling] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNextTo(options[0]?.to ?? "");
    setReason("");
    setHandling("");
    setError("");
  }, [options]);

  const selected = options.find((option) => option.to === nextTo);
  const needsReason = selected?.guard.includes("lý do") ?? false;
  const needsHandling = selected?.guard.includes("hướng xử lý") ?? false;
  const needsShipment =
    selected !== undefined &&
    (selected.guard.includes("đã điều xe") ||
      selected.guard.includes("có ảnh bằng chứng"));

  const canConfirm =
    nextTo !== "" &&
    !submitting &&
    (!needsReason || reason.trim() !== "") &&
    (!needsHandling || handling.trim() !== "");

  const confirmTransition = async () => {
    if (!canConfirm || !selected) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}/transitions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: selected.to,
          ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
          ...(handling.trim() !== "" ? { handling: handling.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setError(
          typeof message === "string" && message !== ""
            ? message
            : `Chuyển trạng thái lỗi (${response.status}).`,
        );
        return;
      }
      router.refresh();
    } catch {
      setError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  const infoRows: { label: string; value: string; tone?: string }[] = [
    { label: "Khách hàng", value: order.customer },
    { label: "SĐT", value: order.phone ?? "-" },
    { label: "Địa chỉ", value: address },
    {
      label: "Độ tin cậy",
      value:
        trust === null
          ? "-"
          : order.addressTrust === null
            ? trust
            : `${order.addressTrust}% - ${trust}`,
      tone: trust === null ? undefined : ORDER_TRUST_TEXT[trust],
    },
    { label: "Mốc giao hẹn", value: formatDateTime(order.deadline) },
  ];

  const auditColumns: TableColumn<ApiAuditRecord>[] = [
    { key: "time", header: "Thời gian", render: (row) => formatShortDateTime(row.at), cellClassName: "text-xs text-gray-700", headerClassName: "w-[139px]" },
    { key: "actor", header: "Người thực hiện", render: (row) => row.actor, cellClassName: "text-xs text-gray-700", headerClassName: "w-[179px]" },
    { key: "action", header: "Hành động", render: (row) => row.action, cellClassName: "text-xs text-gray-700", headerClassName: "w-[259px]" },
    { key: "note", header: "Lý do / ghi chú", render: (row) => row.detail, cellClassName: "text-xs text-gray-700", headerClassName: "w-[259px]" },
    { key: "hash", header: "Hash", render: (row) => row.hash, cellClassName: "text-xs text-gray-700 break-all", headerClassName: "w-[318px]" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold text-gray-900">Chi tiết đơn hàng {order.id}</h1>
          <p className="text-xs text-gray-500">
            Kênh {channelName} - Đặt lúc {formatDateTime(order.createdAt)} - Người tạo: {creator}
          </p>
        </div>
        <span
          className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${ORDER_STATUS_PILL[order.state as OrderStatus] ?? "bg-gray-50 text-gray-700"}`}
        >
          {order.state}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-9 shrink-0 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          In phiếu
        </button>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        <section aria-label="Khách hàng và địa chỉ" className="rounded-lg border border-gray-200 bg-white p-4 xl:w-[58.6%]">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Khách hàng và địa chỉ</h2>
          <div className="flex flex-col gap-3">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-start gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">{row.label}</p>
                <p className={`min-w-0 flex-1 ${row.tone ?? "text-gray-800"}`}>{row.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Hàng hóa" className="flex-1 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Hàng hóa</h2>
          <div className="flex flex-col gap-3">
            {order.items.length === 0 && (
              <p className="text-[13px] text-gray-500">Không có mặt hàng.</p>
            )}
            {order.items.map((item) => {
              const product = productBySku.get(item.sku);
              const lineTotal =
                product?.unitPrice === null || product?.unitPrice === undefined
                  ? "-"
                  : formatMoney(product.unitPrice * item.quantity);
              return (
                <div key={item.sku} className="flex flex-col gap-0.5">
                  <p className="text-[13px] font-medium text-gray-900">
                    {product?.name ?? item.sku} ({item.sku})
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <p className="shrink-0 text-[13px] font-medium text-gray-800">
                      x{item.quantity} - {lineTotal}
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-gray-700">Tổng tiền (COD)</p>
              <p className="text-sm font-semibold text-gray-900">{formatMoney(order.total)}</p>
            </div>
          </div>
        </section>
      </div>

      <section aria-label="Lịch sử luồng" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Lịch sử luồng (Workflow) - quay lui có kiểm soát, mọi bước ghi log
        </h2>
        <div className="flex flex-col gap-3">
          {order.history.length === 0 && (
            <p className="text-xs text-gray-500">Chưa có bước nào trong lịch sử.</p>
          )}
          {order.history.map((entry, index) => {
            const description =
              [entry.reason, entry.handling]
                .filter((part) => part !== undefined && part.trim() !== "")
                .join("; ") || `${entry.by} (${entry.role})`;
            const current = index === order.history.length - 1;
            return (
              <div key={`${entry.at}-${entry.to}-${index}`} className="flex items-center gap-3">
                <span className="size-2.5 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
                <p className="w-11 shrink-0 text-xs text-gray-500">{formatTime(entry.at)}</p>
                <p
                  className={`w-[180px] shrink-0 text-[13px] font-medium ${current ? "text-red-700" : "text-gray-900"}`}
                >
                  {entry.to}
                </p>
                <p className="min-w-0 flex-1 text-xs text-gray-600">{description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {!isClosed && (
        <section aria-label="Chuyển trạng thái" className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Chuyển trạng thái tiếp theo</h2>
          {options.length === 0 ? (
            <p className="text-sm text-gray-600">
              Vai của bạn không có chuyển nào từ trạng thái này.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {error !== "" && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-[280px] max-w-full">
                  <select
                    value={nextTo}
                    onChange={(event) => setNextTo(event.target.value)}
                    aria-label="Chọn trạng thái tiếp theo"
                    className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                  >
                    {options.map((option) => (
                      <option key={option.to} value={option.to}>
                        {option.to === "Đã giao"
                          ? "Đã giao (cần ảnh bằng chứng)"
                          : option.to}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={confirmTransition}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "Đang chuyển..." : "Xác nhận chuyển"}
                </button>
              </div>
              {needsShipment && (
                <p className="text-xs text-gray-500">
                  Chuyển này cần có shipment (điều xe/giao hàng làm ở commit sau); cứ
                  bấm thử, API sẽ báo lỗi nếu chưa đủ điều kiện.
                </p>
              )}
              {needsReason && (
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">Lý do (bắt buộc)</span>
                  <input
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Nhập lý do"
                    className={INPUT_CLASS}
                  />
                </label>
              )}
              {needsHandling && (
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">Hướng xử lý (bắt buộc)</span>
                  <input
                    type="text"
                    value={handling}
                    onChange={(event) => setHandling(event.target.value)}
                    placeholder="Nhập hướng xử lý"
                    className={INPUT_CLASS}
                  />
                </label>
              )}
            </div>
          )}
        </section>
      )}

      <section aria-label="Audit log của đơn" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Audit log của đơn (hash nối chuỗi)
        </h2>
        <Table
          bare
          columns={auditColumns}
          rows={audit}
          rowKey={(row) => String(row.seq)}
          emptyText="Chưa có bản ghi audit cho đơn này"
        />
      </section>
    </div>
  );
}

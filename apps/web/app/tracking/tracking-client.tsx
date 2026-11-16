"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useMemo, useState } from "react";
import { ORDER_STATUS_PILL, formatMoney, type OrderStatus } from "@/data/orders";
import type {
  ApiOrderDetail,
  TrackingLookupResult,
  TrackingStep,
} from "./tracking-types";
import type { ApiOrderHistoryEntry } from "../orders/[id]/order-detail-types";

// 9 trạng thái theo thứ tự định nghĩa luồng. Bước Hủy chỉ hiện khi đơn ở
// trạng thái Hủy; bước cờ địa chỉ nội bộ không hiện cho khách (như bản mẫu).
const STATE_ORDER = [
  "Mới tạo",
  "Đã kiểm tra",
  "Chờ kho",
  "Đang đóng gói",
  "Chờ điều xe",
  "Đang giao",
  "Đã giao",
  "Hoàn",
  "Hủy",
] as const;

const STEP_DESCRIPTIONS: Record<string, string> = {
  "Mới tạo": "Đơn đã tiếp nhận.",
  "Đã kiểm tra": "Địa chỉ và hàng hóa đã xác nhận.",
  "Chờ kho": "Đơn đang chờ kho xử lý.",
  "Đang đóng gói": "Hàng đang được đóng gói tại kho.",
  "Chờ điều xe": "Hàng đã đóng gói, chờ điều xe.",
  "Đang giao": "Tài xế đang trên đường giao.",
  "Đã giao": "Đã giao kèm ảnh bằng chứng.",
  Hoàn: "Đơn hoàn tất, đối soát xong.",
  Hủy: "Đơn đã hủy.",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAddress(order: ApiOrderDetail): string {
  const address = order.address;
  if (!address) return "-";
  const parts = [address.street, address.ward, address.district, address.province].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "-";
}

// Timeline từ history của đơn: bước nào đã qua thì done, bước hiện tại
// thì current, chưa tới thì pending; giờ lấy từ mục history có to == tên
// bước, lấy at mới nhất. Mô tả ưu tiên lý do/hướng xử lý ghi trong history.
function buildSteps(order: ApiOrderDetail): TrackingStep[] {
  const stateOrder = STATE_ORDER as readonly string[];
  const currentIndex = stateOrder.indexOf(order.state);
  const shown = STATE_ORDER.filter((state) => state !== "Hủy" || order.state === "Hủy");
  return shown.map((title) => {
    const index = stateOrder.indexOf(title);
    let entry: ApiOrderHistoryEntry | undefined;
    for (let i = order.history.length - 1; i >= 0; i -= 1) {
      if (order.history[i].to === title) {
        entry = order.history[i];
        break;
      }
    }
    const state: TrackingStep["state"] =
      index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
    const detail = entry ? [entry.reason, entry.handling].filter(Boolean).join("; ") : "";
    let description = detail.length > 0 ? detail : STEP_DESCRIPTIONS[title];
    if (title === "Đang giao" && detail.length === 0 && order.deadline) {
      description = `Tài xế đang trên đường giao, mốc giao ${formatTime(order.deadline)}.`;
    }
    return { title, time: entry ? formatTime(entry.at) : null, description, state };
  });
}

function StepDot({ state }: { state: TrackingStep["state"] }) {
  if (state === "done") {
    return <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-green-600" />;
  }
  if (state === "current") {
    return <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-red-700" />;
  }
  return <span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-gray-300 bg-white" />;
}

export default function TrackingClient() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TrackingLookupResult | null>(null);
  const [searched, setSearched] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const code = query.trim().toUpperCase();
    if (!code || loading) return;
    setLoading(true);
    setError("");
    setAuthError(false);
    setNotFound(false);
    try {
      const response = await fetch(`/api/tracking/${encodeURIComponent(code)}`);
      if (response.status === 404) {
        setResult(null);
        setSearched(code);
        setNotFound(true);
        return;
      }
      if (response.status === 401) {
        setResult(null);
        setAuthError(true);
        setError("Phiên đăng nhập đã hết hạn.");
        return;
      }
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setError(
          typeof message === "string" && message.length > 0
            ? message
            : `API trả về ${response.status}.`,
        );
        setResult(null);
        return;
      }
      const data: unknown = await response.json();
      setResult(data as TrackingLookupResult);
      setSearched(code);
      setNotFound(false);
    } catch {
      setError("Không gọi được máy chủ.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const steps = useMemo(() => (result ? buildSteps(result.order) : []), [result]);

  const events = useMemo(
    () =>
      result
        ? [...result.events].sort((a, b) => a.at.localeCompare(b.at))
        : [],
    [result],
  );

  const productBySku = useMemo(
    () => new Map(result?.products.map((product) => [product.sku, product]) ?? []),
    [result],
  );

  const driverText = useMemo(() => {
    const shipment = result?.shipment ?? null;
    if (!shipment) return "Chưa điều xe";
    const parts = [result?.driverName ?? shipment.driverId, result?.vehiclePlate ?? shipment.vehicleId].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return parts.length > 0 ? parts.join(" - ") : "Chưa điều xe";
  }, [result]);

  const order = result?.order ?? null;
  const delivered = order !== null && (order.state === "Đã giao" || order.state === "Hoàn");
  const proofKey = result?.shipment?.proofPhotoKey ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Theo dõi đơn hàng</h1>

      <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void lookup();
          }}
          placeholder="Nhập mã đơn, ví dụ DH-1044"
          aria-label="Mã đơn cần tra cứu"
          className="h-11 w-[480px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={query.trim().length === 0 || loading}
          className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Đang tra..." : "Tra cứu"}
        </button>
      </div>

      {notFound && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-medium text-gray-900">Không tìm thấy đơn {searched}</p>
          <p className="mt-1 text-sm text-gray-500">Kiểm tra lại mã đơn, ví dụ DH-1044.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-700">
            {error}{" "}
            {authError && (
              <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                Đăng nhập lại
              </Link>
            )}
          </p>
        </div>
      )}

      {order && result && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-lg font-semibold text-gray-900">Đơn hàng {order.id}</h2>
              <span
                className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${ORDER_STATUS_PILL[order.state as OrderStatus]}`}
              >
                {order.state}
              </span>
            </div>
            <div className="mt-2 flex flex-col">
              {steps.map((step) => (
                <div key={step.title} className="flex items-center gap-3 py-2.5">
                  <StepDot state={step.state} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <p
                        className={`flex-1 text-sm font-medium ${
                          step.state === "current" ? "text-red-700" : "text-gray-900"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="shrink-0 text-xs text-gray-500">{step.time ?? "-"}</p>
                    </div>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {events.length > 0 && (
            <section className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Nhật ký giao hàng</h2>
              <div className="mt-2 flex flex-col">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 py-2.5">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-green-600" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-medium text-gray-900">{event.type}</p>
                        <p className="shrink-0 text-xs text-gray-500">{formatDateTime(event.at)}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {event.by} ({event.role})
                        {event.note ? ` - ${event.note}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-3 xl:flex-row">
            <section className="min-w-0 flex-1 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Hàng hóa</h2>
              <div className="mt-3 flex flex-col gap-3">
                {order.items.map((item) => {
                  const product = productBySku.get(item.sku);
                  const lineTotal =
                    product && product.unitPrice !== null
                      ? formatMoney(product.unitPrice * item.quantity)
                      : "-";
                  return (
                    <div key={item.sku} className="flex items-center gap-2 text-[13px] text-gray-800">
                      <p className="min-w-0 flex-1">{product?.name ?? item.sku}</p>
                      <p className="shrink-0 font-medium">
                        x{item.quantity} - {lineTotal}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] font-medium text-gray-700">Tổng tiền (COD)</p>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">{formatMoney(order.total)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-white p-4 xl:w-[468px] xl:shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Giao hàng</h2>
              <p className="mt-3 text-[13px] text-gray-800">Tài xế: {driverText}</p>
              <p className="mt-1 text-xs text-gray-500">Địa chỉ giao: {formatAddress(order)}</p>
            </section>
          </div>

          <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-900">Ảnh bằng chứng giao hàng</h2>
            {delivered && proofKey ? (
              <p className="mt-2 break-all text-xs text-gray-500">
                Đã giao kèm ảnh bằng chứng, khóa tệp: {proofKey}.
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Ảnh bằng chứng sẽ hiện ở đây khi giao xong.</p>
            )}
          </section>

          <div className="flex items-center">
            <Link
              href="/customer-care"
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Tạo yêu cầu hỗ trợ
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

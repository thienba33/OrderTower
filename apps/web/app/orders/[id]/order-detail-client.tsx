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
  ApiDriver,
  ApiOrderDetail,
  ApiReturn,
  ApiShipment,
  ApiVehicle,
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
  shipments,
  drivers,
  vehicles,
  shipmentLoadFailed,
  returns,
  returnsLoadFailed,
}: {
  order: ApiOrderDetail;
  transitions: ApiWorkflowTransition[];
  roles: string[];
  audit: ApiAuditRecord[];
  channels: ApiChannel[];
  products: ApiInventoryItem[];
  shipments: ApiShipment[];
  drivers: ApiDriver[];
  vehicles: ApiVehicle[];
  shipmentLoadFailed: boolean;
  returns: ApiReturn[];
  returnsLoadFailed: boolean;
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
  // Trả hàng đã duyệt được chọn làm hướng xử lý khi đóng đơn; rỗng
  // nghĩa là tự nhập hướng xử lý như trước.
  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNextTo(options[0]?.to ?? "");
    setReason("");
    setHandling("");
    setSelectedReturnId("");
    setError("");
  }, [options]);

  const selected = options.find((option) => option.to === nextTo);
  const needsReason = selected?.guard.includes("lý do") ?? false;
  const needsHandling = selected?.guard.includes("hướng xử lý") ?? false;
  const needsShipment =
    selected !== undefined &&
    (selected.guard.includes("đã điều xe") ||
      selected.guard.includes("có ảnh bằng chứng"));

  // Trả hàng đã duyệt hoặc đã hoàn tiền của đơn này thì dùng được làm
  // hướng xử lý khi đóng đơn; trả hàng đang chờ hoặc đã từ chối thì không.
  const approvedReturns = useMemo(
    () =>
      returns.filter(
        (ret) => ret.status === "Đã duyệt" || ret.status === "Đã hoàn tiền",
      ),
    [returns],
  );

  const canConfirm =
    nextTo !== "" &&
    !submitting &&
    (!needsReason || reason.trim() !== "") &&
    (!needsHandling ||
      selectedReturnId !== "" ||
      handling.trim() !== "");

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
          // Chọn trả hàng thì gửi returnId thay cho handling; API suy ra
          // hướng xử lý từ trả hàng. Tự nhập thì gửi handling như cũ.
          ...(selectedReturnId !== ""
            ? { returnId: selectedReturnId }
            : handling.trim() !== ""
              ? { handling: handling.trim() }
              : {}),
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

  // Giao hàng: shipment đang hoạt động là shipment mới nhất trong các
  // trạng thái Chờ điều xe | Đang giao | Giao thất bại; không có shipment
  // đang hoạt động thì hiện shipment mới nhất (ví dụ Đã giao, Đã hủy).
  // Ẩn/hiện theo vai chỉ là tiện ích giao diện; API kiểm tra lại vai trò,
  // quyền sở hữu shipment và rào chắn ở mỗi thao tác.
  const ACTIVE_SHIPMENT_STATUSES = ["Chờ điều xe", "Đang giao", "Giao thất bại"];
  const sortedShipments = useMemo(
    () =>
      [...shipments].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      ),
    [shipments],
  );
  const currentShipment =
    sortedShipments.find((shipment) =>
      ACTIVE_SHIPMENT_STATUSES.includes(shipment.status),
    ) ?? sortedShipments[0];
  const hasActiveShipment =
    currentShipment !== undefined &&
    ACTIVE_SHIPMENT_STATUSES.includes(currentShipment.status);
  const isDispatcher = roles.includes("Điều phối viên");
  const isDriver = roles.includes("Tài xế");
  const canCreateShipment =
    order.state === "Chờ điều xe" && !hasActiveShipment && isDispatcher;
  const canDispatch =
    currentShipment !== undefined &&
    (currentShipment.status === "Chờ điều xe" ||
      currentShipment.status === "Giao thất bại") &&
    isDispatcher;
  const canDeliver =
    currentShipment?.status === "Đang giao" && isDriver;
  const canFail =
    currentShipment?.status === "Đang giao" && (isDriver || isDispatcher);
  const canCancel =
    currentShipment?.status === "Chờ điều xe" && isDispatcher;

  const driverName =
    currentShipment?.driverId === null || currentShipment?.driverId === undefined
      ? "-"
      : drivers.find((driver) => driver.id === currentShipment.driverId)?.name ??
        currentShipment.driverId;
  const vehiclePlate =
    currentShipment?.vehicleId === null || currentShipment?.vehicleId === undefined
      ? "-"
      : vehicles.find((vehicle) => vehicle.id === currentShipment.vehicleId)
          ?.plate ?? currentShipment.vehicleId;

  const [dispatchDriverId, setDispatchDriverId] = useState("");
  const [dispatchVehicleId, setDispatchVehicleId] = useState("");
  const [proofPhotoKey, setProofPhotoKey] = useState("");
  const [failReason, setFailReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [shipmentError, setShipmentError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const postShipment = async (
    path: string,
    body: unknown,
    action: string,
  ) => {
    setBusyAction(action);
    setShipmentError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setShipmentError(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác giao hàng lỗi (${response.status}).`,
        );
        return;
      }
      if (action === "dispatch") {
        setDispatchDriverId("");
        setDispatchVehicleId("");
      }
      if (action === "deliver") {
        setProofPhotoKey("");
      }
      if (action === "fail") {
        setFailReason("");
      }
      if (action === "cancel") {
        setCancelReason("");
      }
      router.refresh();
    } catch {
      setShipmentError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setBusyAction(null);
    }
  };

  // Trả hàng: chỉ 2 trạng thái đầu là đang hoạt động, đơn đã có trả
  // hàng đang hoạt động thì không tạo thêm. Ẩn/hiện theo vai chỉ là
  // tiện ích giao diện; API kiểm tra lại vai trò và trạng thái ở mỗi
  // thao tác.
  const RETURN_STATUS_PILL: Record<string, string> = {
    "Chờ xử lý": "bg-amber-50 text-amber-800",
    "Đã duyệt": "bg-green-50 text-green-700",
    "Đã từ chối": "bg-gray-50 text-gray-700",
    "Đã hoàn tiền": "bg-blue-50 text-blue-700",
  };
  const ACTIVE_RETURN_STATUSES = ["Chờ xử lý", "Đã duyệt"];
  const sortedReturns = useMemo(
    () =>
      [...returns].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      ),
    [returns],
  );
  const activeReturn = sortedReturns.find((ret) =>
    ACTIVE_RETURN_STATUSES.includes(ret.status),
  );
  const isCskh = roles.includes("Nhân viên chăm sóc khách hàng");
  const isManager =
    roles.includes("Quản lý") || roles.includes("Quản trị viên");
  const canCreateReturn =
    order.state === "Đã giao" && activeReturn === undefined && isCskh;

  const [createReturnReason, setCreateReturnReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [returnError, setReturnError] = useState("");

  const postReturn = async (
    path: string,
    body: unknown,
    action: string,
  ) => {
    setBusyAction(action);
    setReturnError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setReturnError(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác trả hàng lỗi (${response.status}).`,
        );
        return;
      }
      if (action === "create-return") {
        setCreateReturnReason("");
      }
      if (action === "reject-return") {
        setRejectReason("");
      }
      router.refresh();
    } catch {
      setReturnError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setBusyAction(null);
    }
  };

  const shipmentInfoRows: { label: string; value: string }[] =
    currentShipment === undefined
      ? []
      : [
          { label: "Mã shipment", value: currentShipment.id },
          { label: "Trạng thái", value: currentShipment.status },
          { label: "Tài xế", value: driverName },
          { label: "Xe", value: vehiclePlate },
          {
            label: "Khóa bằng chứng",
            value: currentShipment.proofPhotoKey ?? "-",
          },
        ];

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
                  Chuyển này cần có shipment; dùng section Giao hàng (Shipment) bên
                  dưới để điều xe hoặc giao hàng trước.
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
                <div className="flex min-w-0 flex-col gap-3">
                  {approvedReturns.length > 0 && (
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-sm font-medium text-gray-700">
                        Hướng xử lý (bắt buộc)
                      </span>
                      <div className="relative w-full max-w-full">
                        <select
                          value={selectedReturnId}
                          onChange={(event) => setSelectedReturnId(event.target.value)}
                          aria-label="Chọn trả hàng làm hướng xử lý"
                          className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                        >
                          <option value="">Tự nhập hướng xử lý</option>
                          {approvedReturns.map((ret) => (
                            <option key={ret.id} value={ret.id}>
                              Trả hàng {ret.id} - {ret.status} - {ret.reason}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                      </div>
                    </label>
                  )}
                  {selectedReturnId === "" && (
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {approvedReturns.length === 0 && (
                        <span className="text-sm font-medium text-gray-700">
                          Hướng xử lý (bắt buộc)
                        </span>
                      )}
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
            </div>
          )}
        </section>
      )}

      <section aria-label="Giao hàng" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Giao hàng (Shipment)</h2>
        <div className="flex flex-col gap-3">
          {shipmentLoadFailed && (
            <p className="text-sm text-gray-600">
              Không tải được danh sách giao hàng, thử tải lại trang.
            </p>
          )}
          {shipmentError !== "" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {shipmentError}
            </p>
          )}
          {currentShipment === undefined ? (
            <p className="text-sm text-gray-600">Chưa có shipment cho đơn này.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {shipmentInfoRows.map((row) => (
                  <div key={row.label} className="flex items-start gap-2 text-[13px]">
                    <p className="w-[130px] shrink-0 text-gray-500">{row.label}</p>
                    <p className="min-w-0 flex-1 text-gray-800">{row.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {currentShipment.history.length === 0 && (
                  <p className="text-xs text-gray-500">Chưa có lịch sử giao hàng.</p>
                )}
                {currentShipment.history.map((entry, index) => {
                  const description =
                    entry.reason !== undefined && entry.reason.trim() !== ""
                      ? `${entry.by} (${entry.role}) - ${entry.reason}`
                      : `${entry.by} (${entry.role})`;
                  return (
                    <div key={`${entry.at}-${entry.to}-${index}`} className="flex items-center gap-3">
                      <span className="size-2.5 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
                      <p className="w-11 shrink-0 text-xs text-gray-500">{formatTime(entry.at)}</p>
                      <p className="w-[180px] shrink-0 text-[13px] font-medium text-gray-900">
                        {entry.from === null ? entry.to : `${entry.from} -> ${entry.to}`}
                      </p>
                      <p className="min-w-0 flex-1 text-xs text-gray-600">{description}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {canCreateShipment && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Tạo shipment</p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-600">
                  Đơn đang chờ điều xe, chưa có shipment.
                </p>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() =>
                    postShipment("/api/shipments", { orderId: order.id }, "create")
                  }
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "create" ? "Đang tạo..." : "Tạo shipment"}
                </button>
              </div>
            </div>
          )}
          {canDispatch && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Điều xe</p>
              {drivers.length === 0 || vehicles.length === 0 ? (
                <p className="text-sm text-gray-600">Chưa có tài xế/xe sẵn sàng.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-[280px] max-w-full">
                    <select
                      value={dispatchDriverId}
                      onChange={(event) => setDispatchDriverId(event.target.value)}
                      aria-label="Chọn tài xế"
                      className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                    >
                      <option value="">Chọn tài xế</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} - {driver.username}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                  <div className="relative w-[280px] max-w-full">
                    <select
                      value={dispatchVehicleId}
                      onChange={(event) => setDispatchVehicleId(event.target.value)}
                      aria-label="Chọn xe"
                      className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                    >
                      <option value="">Chọn xe</option>
                      {vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} ({vehicle.type})
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
                    disabled={
                      dispatchDriverId === "" ||
                      dispatchVehicleId === "" ||
                      busyAction !== null
                    }
                    onClick={() =>
                      postShipment(
                        `/api/shipments/${currentShipment.id}/dispatch`,
                        { driverId: dispatchDriverId, vehicleId: dispatchVehicleId },
                        "dispatch",
                      )
                    }
                    className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyAction === "dispatch" ? "Đang điều xe..." : "Điều xe"}
                  </button>
                </div>
              )}
            </div>
          )}
          {canDeliver && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Giao hàng</p>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Khóa tệp bằng chứng (bắt buộc)
                </span>
                <input
                  type="text"
                  value={proofPhotoKey}
                  onChange={(event) => setProofPhotoKey(event.target.value)}
                  placeholder="Nhập khóa tệp bằng chứng"
                  className={INPUT_CLASS}
                />
              </label>
              <p className="text-xs text-gray-500">
                Nhập khóa tệp bằng chứng đã lưu trong kho đối tượng; upload file
                làm sau.
              </p>
              <div>
                <button
                  type="button"
                  disabled={proofPhotoKey.trim() === "" || busyAction !== null}
                  onClick={() =>
                    postShipment(
                      `/api/shipments/${currentShipment.id}/deliver`,
                      { proofPhotoKey: proofPhotoKey.trim() },
                      "deliver",
                    )
                  }
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "deliver" ? "Đang giao..." : "Xác nhận đã giao"}
                </button>
              </div>
            </div>
          )}
          {canFail && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Giao thất bại</p>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Lý do (bắt buộc)</span>
                <input
                  type="text"
                  value={failReason}
                  onChange={(event) => setFailReason(event.target.value)}
                  placeholder="Nhập lý do giao thất bại"
                  className={INPUT_CLASS}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={failReason.trim() === "" || busyAction !== null}
                  onClick={() =>
                    postShipment(
                      `/api/shipments/${currentShipment.id}/fail`,
                      { reason: failReason.trim() },
                      "fail",
                    )
                  }
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "fail" ? "Đang báo..." : "Báo giao thất bại"}
                </button>
              </div>
            </div>
          )}
          {canCancel && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Hủy shipment</p>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Lý do (bắt buộc)</span>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Nhập lý do hủy shipment"
                  className={INPUT_CLASS}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={cancelReason.trim() === "" || busyAction !== null}
                  onClick={() =>
                    postShipment(
                      `/api/shipments/${currentShipment.id}/cancel`,
                      { reason: cancelReason.trim() },
                      "cancel",
                    )
                  }
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "cancel" ? "Đang hủy..." : "Hủy shipment"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-label="Trả hàng" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Trả hàng</h2>
        <div className="flex flex-col gap-3">
          {returnsLoadFailed && (
            <p className="text-sm text-gray-600">
              Không tải được danh sách trả hàng, thử tải lại trang.
            </p>
          )}
          {returnError !== "" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {returnError}
            </p>
          )}
          {sortedReturns.length === 0 ? (
            <p className="text-sm text-gray-600">Chưa có trả hàng cho đơn này.</p>
          ) : (
            sortedReturns.map((ret) => (
              <div key={ret.id} className="flex flex-col gap-3 rounded-md border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{ret.id}</p>
                  <span
                    className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${RETURN_STATUS_PILL[ret.status] ?? "bg-gray-50 text-gray-700"}`}
                  >
                    {ret.status}
                  </span>
                  <p className="text-xs text-gray-500">
                    Tạo lúc {formatDateTime(ret.createdAt)} - Cập nhật {formatDateTime(ret.updatedAt)}
                  </p>
                </div>
                <p className="text-[13px] text-gray-800">Lý do: {ret.reason}</p>
                {ret.status === "Chờ xử lý" && isManager && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          postReturn(`/api/returns/${ret.id}/approve`, {}, "approve-return")
                        }
                        className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyAction === "approve-return" ? "Đang duyệt..." : "Duyệt"}
                      </button>
                    </div>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-sm font-medium text-gray-700">Lý do từ chối (bắt buộc)</span>
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Nhập lý do từ chối"
                        className={INPUT_CLASS}
                      />
                    </label>
                    <div>
                      <button
                        type="button"
                        disabled={rejectReason.trim() === "" || busyAction !== null}
                        onClick={() =>
                          postReturn(
                            `/api/returns/${ret.id}/reject`,
                            { reason: rejectReason.trim() },
                            "reject-return",
                          )
                        }
                        className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyAction === "reject-return" ? "Đang từ chối..." : "Từ chối"}
                      </button>
                    </div>
                  </div>
                )}
                {ret.status === "Đã duyệt" && isDispatcher && (
                  <div>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        postReturn(`/api/returns/${ret.id}/refund`, {}, "refund-return")
                      }
                      className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyAction === "refund-return" ? "Đang hoàn tiền..." : "Hoàn tiền"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {canCreateReturn && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-700">Tạo trả hàng</p>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Lý do (bắt buộc)</span>
                <input
                  type="text"
                  value={createReturnReason}
                  onChange={(event) => setCreateReturnReason(event.target.value)}
                  placeholder="Nhập lý do trả hàng"
                  className={INPUT_CLASS}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={createReturnReason.trim() === "" || busyAction !== null}
                  onClick={() =>
                    postReturn(
                      "/api/returns",
                      { orderId: order.id, reason: createReturnReason.trim() },
                      "create-return",
                    )
                  }
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "create-return" ? "Đang tạo..." : "Tạo trả hàng"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

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

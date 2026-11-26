// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DriverPhone } from "@/components/driver/DriverPhone";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/data/orders";
import {
  DRIVER_SHIPMENT_LABEL,
  DRIVER_SHIPMENT_PILL,
  type ApiInventoryItem,
  type DriverDetailView,
} from "../driver-types";

type UpdateChoice = "Đã giao" | "Giao không thành công";

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-500";

// ISO -> "HH:mm" giờ Việt Nam, null hoặc sai thì "-".
function formatTime(iso: string | null): string {
  if (!iso) {
    return "-";
  }
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

// ISO -> "DD/MM HH:mm" giờ Việt Nam, null hoặc sai thì "-".
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
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

function TimelineDot({ future }: { future: boolean }) {
  return future ? (
    <span className="size-2 shrink-0 rounded-full border border-gray-300 bg-white" aria-hidden="true" />
  ) : (
    <span className="size-2 shrink-0 rounded-full bg-red-700" aria-hidden="true" />
  );
}

function PhoneHeader({ title }: { title: string }) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 px-4">
        <Link href="/driver" aria-label="Quay lại danh sách đơn" className="shrink-0 text-lg font-medium text-gray-700">
          {"<"}
        </Link>
        <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">{title}</p>
      </div>
      <div className="h-px shrink-0 bg-gray-200" />
    </>
  );
}

function PhoneNotice({ title, message, login }: { title: string; message: string; login?: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500">{message}</p>
      <Link
        href={login ? "/api/auth/login" : "/driver"}
        className="flex h-9 items-center justify-center rounded-md bg-red-700 text-sm font-medium text-white hover:bg-red-800"
      >
        {login ? "Đăng nhập" : "Quay lại danh sách đơn"}
      </Link>
    </div>
  );
}

export default function DriverDetailClient({ view }: { view: DriverDetailView }) {
  const router = useRouter();
  const goList = () => router.push("/driver");

  if (view.kind === "login") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice
          title="Chưa đăng nhập"
          message="Bạn chưa đăng nhập. Đăng nhập để xem chi tiết đơn giao hàng."
          login
        />
      </DriverPhone>
    );
  }
  if (view.kind === "no-driver") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice title="Chưa gắn tài xế" message="Tài khoản này chưa gắn với tài xế nào." />
      </DriverPhone>
    );
  }
  if (view.kind === "not-found") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice title="Không tìm thấy đơn hàng" message={`Mã đơn ${view.id} không có trong hệ thống.`} />
      </DriverPhone>
    );
  }
  if (view.kind === "no-shipment") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice title="Chưa được điều xe" message={`Đơn ${view.id} chưa được điều xe, chưa thuộc tài xế nào.`} />
      </DriverPhone>
    );
  }
  if (view.kind === "not-own") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice title="Không phải đơn của bạn" message="Đơn này không thuộc tài xế đang đăng nhập." />
      </DriverPhone>
    );
  }
  if (view.kind === "error") {
    return (
      <DriverPhone activeTab="orders" onTab={goList}>
        <PhoneHeader title="Chi tiết đơn" />
        <PhoneNotice title="Không tải được chi tiết" message={view.message} />
      </DriverPhone>
    );
  }

  return <DriverDetailOk view={view} />;
}

function DriverDetailOk({ view }: { view: Extract<DriverDetailView, { kind: "ok" }> }) {
  const router = useRouter();
  const { order, shipment, events, products, driver, vehicleLabel } = view;

  const productBySku = useMemo(() => {
    const map = new Map<string, ApiInventoryItem>();
    for (const product of products) {
      map.set(product.sku, product);
    }
    return map;
  }, [products]);

  const address = useMemo(() => {
    const parts = [
      order.address?.street,
      order.address?.ward,
      order.address?.district,
      order.address?.province,
    ].filter((part) => part !== undefined && part.trim() !== "");
    return parts.length > 0 ? parts.join(", ") : "-";
  }, [order.address]);

  // Timeline gộp lịch sử đơn và nhật ký giao hàng, xếp theo giờ; mốc giao
  // hẹn là mốc tương lai ở cuối.
  const timeline = useMemo(() => {
    const entries: { time: string; label: string; future: boolean }[] = [];
    for (const entry of order.history) {
      const description =
        [entry.reason, entry.handling]
          .filter((part) => part !== undefined && part.trim() !== "")
          .join("; ") || `${entry.by} (${entry.role})`;
      entries.push({ time: entry.at, label: `${entry.to} - ${description}`, future: false });
    }
    for (const event of events) {
      const label =
        event.note !== null && event.note.trim() !== ""
          ? `${event.type} - ${event.note} (${event.by})`
          : `${event.type} (${event.by})`;
      entries.push({ time: event.at, label, future: false });
    }
    entries.sort((a, b) => a.time.localeCompare(b.time));
    if (order.deadline) {
      entries.push({ time: order.deadline, label: "Mốc giao hẹn", future: true });
    }
    return entries;
  }, [order.history, order.deadline, events]);

  const statusLabel = DRIVER_SHIPMENT_LABEL[shipment.status];
  const statusPill = DRIVER_SHIPMENT_PILL[shipment.status];
  const canUpdate = shipment.status === "Đang giao";
  const delivered = shipment.status === "Đã giao";
  const failed = shipment.status === "Giao thất bại";
  const cancelled = shipment.status === "Đã hủy";
  const finished = delivered || failed || cancelled;
  const lastHistory = shipment.history[shipment.history.length - 1];
  const resultTime = lastHistory ? formatTime(lastHistory.at) : "";
  const resultReason = lastHistory?.reason ?? "";

  const [nextStatus, setNextStatus] = useState<UpdateChoice>("Đã giao");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<UpdateChoice>("Đã giao");
  const [proofPhotoFile, setProofPhotoFile] = useState<File | null>(null);
  const [failReason, setFailReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openDialog = (preset: UpdateChoice) => {
    setDialogStatus(preset);
    setProofPhotoFile(null);
    setFailReason("");
    setDialogError("");
    setDialogOpen(true);
  };

  const canConfirm =
    !submitting &&
    (dialogStatus === "Đã giao"
      ? proofPhotoFile !== null
      : failReason.trim() !== "");

  const confirmUpdate = async () => {
    if (!canConfirm) {
      return;
    }
    setSubmitting(true);
    setDialogError("");
    try {
      if (dialogStatus === "Đã giao") {
        if (!proofPhotoFile) {
          setDialogError("Chọn ảnh bằng chứng giao hàng.");
          return;
        }
        const form = new FormData();
        form.append("file", proofPhotoFile);
        form.append("kind", "proof_photo");
        form.append("orderId", order.id);
        const upload = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        if (!upload.ok) {
          const data: unknown = await upload.json().catch(() => null);
          const message = (data as { message?: unknown } | null)?.message;
          setDialogError(
            typeof message === "string" && message !== ""
              ? message
              : `Upload ảnh bằng chứng lỗi (${upload.status}).`,
          );
          return;
        }
        const uploaded: unknown = await upload.json().catch(() => null);
        const fileId = (uploaded as { id?: unknown } | null)?.id;
        if (typeof fileId !== "string" || fileId === "") {
          setDialogError("API không trả về mã file bằng chứng.");
          return;
        }
        const response = await fetch(
          `/api/shipments/${shipment.id}/deliver`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ proofPhotoFileId: fileId }),
          },
        );
        if (!response.ok) {
          const data: unknown = await response.json().catch(() => null);
          const message = (data as { message?: unknown } | null)?.message;
          setDialogError(
            typeof message === "string" && message !== ""
              ? message
              : `Cập nhật giao hàng lỗi (${response.status}).`,
          );
          return;
        }
      } else {
        const response = await fetch(
          `/api/shipments/${shipment.id}/fail`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: failReason.trim() }),
          },
        );
        if (!response.ok) {
          const data: unknown = await response.json().catch(() => null);
          const message = (data as { message?: unknown } | null)?.message;
          setDialogError(
            typeof message === "string" && message !== ""
              ? message
              : `Cập nhật giao hàng lỗi (${response.status}).`,
          );
          return;
        }
      }
      setDialogOpen(false);
      router.refresh();
    } catch {
      setDialogError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  const telHref =
    order.phone === null ? null : `tel:${order.phone.replace(/\s+/g, "")}`;

  return (
    <DriverPhone activeTab="orders" onTab={() => router.push("/driver")}>
      <PhoneHeader title={`Chi tiết đơn ${order.id}`} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">{order.id}</p>
            <span className={`flex h-[22px] shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-medium ${statusPill}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-[13px] text-gray-800">
            {order.customer} - {order.phone ?? "-"}
          </p>
          <p className="text-xs text-gray-600">{address}</p>
          <p className="text-xs text-gray-600">
            Mốc giao hẹn: {formatDateTime(order.deadline)} - COD: {formatMoney(order.total)}
          </p>
          {order.items.map((item) => {
            const product = productBySku.get(item.sku);
            const lineTotal =
              product?.unitPrice === null || product?.unitPrice === undefined
                ? "-"
                : formatMoney(product.unitPrice * item.quantity);
            return (
              <p key={item.sku} className="text-xs text-gray-600">
                {product?.name ?? item.sku} ({item.sku}) - x{item.quantity} - {lineTotal}
              </p>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Lịch sử giao hàng</p>
          {timeline.length === 0 && (
            <p className="text-xs text-gray-500">Chưa có lịch sử giao hàng.</p>
          )}
          {timeline.map((event, index) => (
            <div key={`${event.time}-${event.label}-${index}`} className="flex items-center gap-2">
              <TimelineDot future={event.future} />
              <p className="w-11 shrink-0 text-xs text-gray-500">{formatTime(event.time)}</p>
              <p className="min-w-0 flex-1 text-[13px] text-gray-800">{event.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">Ảnh bằng chứng giao hàng</p>
          {shipment.proofPhotoKey ? (
            <p className="text-sm font-medium text-green-700">
              Đã giao kèm ảnh bằng chứng, khóa tệp: {shipment.proofPhotoKey}
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Chưa có ảnh bằng chứng. Nhập khóa tệp khi xác nhận đã giao.
            </p>
          )}
        </div>

        {finished && (
          <div className={`flex flex-col gap-1 rounded-lg border p-3 ${delivered ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className={`text-sm font-semibold ${delivered ? "text-green-700" : "text-red-700"}`}>
              {delivered
                ? `Đã giao lúc ${resultTime}`
                : cancelled
                  ? `Shipment đã hủy lúc ${resultTime}${resultReason !== "" ? ` - ${resultReason}` : ""}`
                  : `Giao không thành công lúc ${resultTime}${resultReason !== "" ? ` - ${resultReason}` : ""}`}
            </p>
          </div>
        )}

        {shipment.status === "Chờ điều xe" && (
          <p className="text-sm text-gray-600">
            Đơn đang chờ điều xe, chưa thể cập nhật giao hàng.
          </p>
        )}

        {canUpdate && (
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold text-gray-900">Cập nhật trạng thái</p>
            <span className="relative block w-full">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as UpdateChoice)}
                aria-label="Trạng thái mới"
                className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
              >
                <option value="Đã giao">Đã giao</option>
                <option value="Giao không thành công">Giao không thành công</option>
              </select>
              <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </span>
            <button
              type="button"
              onClick={() => openDialog(nextStatus)}
              className="flex h-11 w-full items-center justify-center rounded-md bg-red-700 text-[15px] font-medium text-white hover:bg-red-800"
            >
              {nextStatus === "Đã giao" ? "Xác nhận đã giao" : "Giao không thành công"}
            </button>
            <button
              type="button"
              onClick={() => openDialog("Giao không thành công")}
              className="flex h-11 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-[15px] font-medium text-gray-700 hover:bg-gray-100"
            >
              Giao không thành công
            </button>
          </div>
        )}

        {telHref ? (
          <a
            href={telHref}
            className="flex h-11 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Liên hệ khách qua CSKH
          </a>
        ) : (
          <p className="text-xs text-gray-500">Không có SĐT khách để liên hệ.</p>
        )}
      </div>

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`Cập nhật giao hàng - ${order.id}`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={confirmUpdate}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? "Đang cập nhật..."
                : dialogStatus === "Đã giao"
                  ? "Xác nhận đã giao"
                  : "Báo giao thất bại"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            {driver.name} - {vehicleLabel} - Mốc giao hẹn {formatDateTime(order.deadline)}
          </p>
          {dialogError !== "" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {dialogError}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="driver-dialog-status" className="text-sm font-medium text-gray-700">
              Trạng thái mới
            </label>
            <span className="relative block w-full">
              <select
                id="driver-dialog-status"
                value={dialogStatus}
                onChange={(event) => setDialogStatus(event.target.value as UpdateChoice)}
                aria-label="Trạng thái mới"
                className="h-8 w-full appearance-none rounded-md border border-gray-300 bg-white pl-2 pr-7 text-xs text-gray-700 outline-none focus:border-gray-500"
              >
                <option value="Đã giao">Đã giao</option>
                <option value="Giao không thành công">Giao không thành công</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
            </span>
          </div>
          {dialogStatus === "Đã giao" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="driver-proof-file" className="text-sm font-medium text-gray-700">
                Ảnh bằng chứng giao hàng (bắt buộc)
              </label>
              <input
                id="driver-proof-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setProofPhotoFile(event.target.files?.[0] ?? null)
                }
                aria-label="Ảnh bằng chứng giao hàng"
                className="text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-red-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-red-800"
              />
              <p className="text-xs text-gray-500">
                Ảnh được upload lên kho đối tượng và kiểm dịch trước khi giao.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="driver-fail-reason" className="text-sm font-medium text-gray-700">
                Lý do giao không thành công (bắt buộc)
              </label>
              <input
                id="driver-fail-reason"
                type="text"
                value={failReason}
                onChange={(event) => setFailReason(event.target.value)}
                placeholder="Nhập lý do giao thất bại"
                aria-label="Lý do giao không thành công"
                className={INPUT_CLASS}
              />
            </div>
          )}
        </div>
      </Modal>
    </DriverPhone>
  );
}

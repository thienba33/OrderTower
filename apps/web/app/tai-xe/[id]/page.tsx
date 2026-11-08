// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DriverPhone } from "@/components/driver/DriverPhone";
import { Modal } from "@/components/ui/Modal";
import {
  DRIVER_NAME,
  DRIVER_ORDERS,
  DRIVER_STATUS_PILL,
  DRIVER_VEHICLE,
  formatCod,
  type DriverOrderStatus,
  type DriverTimelineEvent,
} from "@/data/driver";

const UPDATE_OPTIONS: DriverOrderStatus[] = ["Đã giao", "Giao không thành công"];
const FAIL_REASONS = ["Khách không nghe máy", "Khách vắng nhà", "Khách từ chối nhận", "Sai địa chỉ", "Khác"];

function minusMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins - minutes;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function TimelineDot({ future }: { future: boolean }) {
  return future ? (
    <span className="size-2 shrink-0 rounded-full border border-gray-300 bg-white" aria-hidden="true" />
  ) : (
    <span className="size-2 shrink-0 rounded-full bg-red-700" aria-hidden="true" />
  );
}

export default function DriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const order = DRIVER_ORDERS.find((item) => item.id === id) ?? null;

  const initialStatus = order?.status ?? "Đang giao";
  const initialTimeline = order?.timeline ?? [];

  const [status, setStatus] = useState<DriverOrderStatus>(initialStatus);
  const [timeline, setTimeline] = useState<DriverTimelineEvent[]>(initialTimeline);
  const [nextStatus, setNextStatus] = useState<DriverOrderStatus>("Đã giao");
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [resultTime, setResultTime] = useState<string | null>(null);
  const [resultReason, setResultReason] = useState("");
  const [photoTaken, setPhotoTaken] = useState(initialStatus === "Đã giao");
  const [contactSent, setContactSent] = useState(false);

  useEffect(() => {
    if (order === null) return;
    setStatus(order.status);
    setTimeline(order.timeline);
    setNextStatus("Đã giao");
    setNote("");
    setSavedNote("");
    setResultTime(order.timeline.find((event) => event.label === "Đã giao")?.time ?? null);
    setResultReason("");
    setPhotoTaken(order.status === "Đã giao");
    setContactSent(false);
  }, [order]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<DriverOrderStatus>("Đã giao");
  const [dialogNote, setDialogNote] = useState("");
  const [failReason, setFailReason] = useState("");

  if (order === null) {
    return (
      <DriverPhone activeTab="orders" onTab={() => router.push("/tai-xe")}>
        <div className="flex h-14 shrink-0 items-center gap-3 px-4">
          <Link href="/tai-xe" aria-label="Quay lại danh sách đơn" className="shrink-0 text-lg font-medium text-gray-700">
            {"<"}
          </Link>
          <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">Chi tiết đơn</p>
        </div>
        <div className="h-px shrink-0 bg-gray-200" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h1 className="text-base font-semibold text-gray-900">Không tìm thấy đơn hàng</h1>
          <p className="text-sm text-gray-500">Không có đơn {id === "" ? "này" : id} trong danh sách của tài xế.</p>
          <Link href="/tai-xe" className="flex h-9 items-center justify-center rounded-md bg-red-700 text-sm font-medium text-white hover:bg-red-800">
            Quay lại danh sách đơn
          </Link>
        </div>
      </DriverPhone>
    );
  }

  const openDialog = (preset: DriverOrderStatus) => {
    setDialogStatus(preset);
    setDialogNote(note);
    setFailReason("");
    setDialogOpen(true);
  };

  const confirmUpdate = () => {
    if (dialogStatus === "Giao không thành công" && failReason === "") return;
    const at = minusMinutes(order.deadline, 8);
    const label = dialogStatus === "Đã giao" ? "Đã giao" : `Giao không thành công - ${failReason}`;
    setTimeline((prev) => {
      const markerIndex = prev.findIndex((event) => event.label === "Mốc giao hẹn");
      const next = [...prev];
      const entry = { time: at, label };
      if (markerIndex === -1) next.push(entry);
      else next.splice(markerIndex, 0, entry);
      return next;
    });
    setStatus(dialogStatus);
    setResultTime(at);
    setResultReason(dialogStatus === "Giao không thành công" ? failReason : "");
    setSavedNote(dialogNote);
    setDialogOpen(false);
  };

  const delivered = status === "Đã giao";
  const failed = status === "Giao không thành công";
  const finished = delivered || failed;

  return (
    <DriverPhone activeTab="orders" onTab={() => router.push("/tai-xe")}>
      <div className="flex h-14 shrink-0 items-center gap-3 px-4">
        <Link href="/tai-xe" aria-label="Quay lại danh sách đơn" className="shrink-0 text-lg font-medium text-gray-700">
          {"<"}
        </Link>
        <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">Chi tiết đơn {order.id}</p>
      </div>
      <div className="h-px shrink-0 bg-gray-200" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">{order.id}</p>
            <span className={`flex h-[22px] shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-medium ${DRIVER_STATUS_PILL[status]}`}>
              {status}
            </span>
          </div>
          <p className="text-[13px] text-gray-800">
            {order.customer} - {order.phone}
          </p>
          <p className="text-xs text-gray-600">{order.address}</p>
          <p className="text-xs text-gray-600">
            Mốc giao hẹn: {order.deadline} - COD: {formatCod(order.cod)} - {order.sku} x{order.quantity}, lô {order.lot}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Lịch sử giao hàng</p>
          {timeline.map((event) => (
            <div key={`${event.time}-${event.label}`} className="flex items-center gap-2">
              <TimelineDot future={event.label === "Mốc giao hẹn"} />
              <p className="w-11 shrink-0 text-xs text-gray-500">{event.time}</p>
              <p className="min-w-0 flex-1 text-[13px] text-gray-800">{event.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">Ảnh bằng chứng giao hàng</p>
          {photoTaken ? (
            <p className="text-sm font-medium text-green-700">Đã chụp ảnh bằng chứng</p>
          ) : (
            <button
              type="button"
              onClick={() => setPhotoTaken(true)}
              className="flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Chụp ảnh bằng chứng
            </button>
          )}
        </div>

        {finished ? (
          <div className={`flex flex-col gap-1 rounded-lg border p-3 ${delivered ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className={`text-sm font-semibold ${delivered ? "text-green-700" : "text-red-700"}`}>
              {delivered ? `Đã giao lúc ${resultTime ?? ""}` : `Giao không thành công lúc ${resultTime ?? ""} - ${resultReason}`}
            </p>
            {savedNote !== "" && <p className="text-sm text-gray-700">Ghi chú: {savedNote}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold text-gray-900">Cập nhật trạng thái</p>
            <span className="relative block w-full">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as DriverOrderStatus)}
                aria-label="Trạng thái mới"
                className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
              >
                {UPDATE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ghi chú giao hàng..."
              aria-label="Ghi chú giao hàng"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-500"
            />
            <button
              type="button"
              onClick={() => openDialog(nextStatus)}
              className="flex h-11 w-full items-center justify-center rounded-md bg-red-700 text-[15px] font-medium text-white hover:bg-red-800"
            >
              Xác nhận đã giao
            </button>
            <button
              type="button"
              onClick={() => {
                setNextStatus("Giao không thành công");
                openDialog("Giao không thành công");
              }}
              className="flex h-11 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-[15px] font-medium text-gray-700 hover:bg-gray-100"
            >
              Giao không thành công
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setContactSent(true)}
          className="flex h-11 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Liên hệ khách qua CSKH
        </button>
        {contactSent && (
          <p className="text-xs text-gray-500">
            Đã chuyển yêu cầu liên hệ tới CSKH - SĐT khách: {order.phone}
          </p>
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
              disabled={dialogStatus === "Giao không thành công" && failReason === ""}
              onClick={confirmUpdate}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận đã giao
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            {DRIVER_NAME} - {DRIVER_VEHICLE} - Mốc giao hẹn {order.deadline}
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="driver-dialog-status" className="text-sm font-medium text-gray-700">
              Trạng thái mới
            </label>
            <span className="relative block w-full">
              <select
                id="driver-dialog-status"
                value={dialogStatus}
                onChange={(event) => setDialogStatus(event.target.value as DriverOrderStatus)}
                aria-label="Trạng thái mới"
                className="h-8 w-full appearance-none rounded-md border border-gray-300 bg-white pl-2 pr-7 text-xs text-gray-700 outline-none focus:border-gray-500"
              >
                {UPDATE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900">Ảnh bằng chứng giao hàng</p>
            {photoTaken ? (
              <p className="text-sm font-medium text-green-700">Đã chụp ảnh bằng chứng</p>
            ) : (
              <button
                type="button"
                onClick={() => setPhotoTaken(true)}
                className="flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Chụp ảnh bằng chứng
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="driver-dialog-note" className="text-sm font-medium text-gray-700">
              Ghi chú giao hàng
            </label>
            <input
              id="driver-dialog-note"
              type="text"
              value={dialogNote}
              onChange={(event) => setDialogNote(event.target.value)}
              placeholder={`Ví dụ: khách nhận tại cửa, COD ${formatCod(order.cod)}...`}
              aria-label="Ghi chú giao hàng"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-500"
            />
          </div>
          {dialogStatus === "Giao không thành công" && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <label htmlFor="driver-fail-reason" className="sr-only">
                  Lý do giao không thành công
                </label>
                <span className="relative block w-full">
                  <select
                    id="driver-fail-reason"
                    value={failReason}
                    onChange={(event) => setFailReason(event.target.value)}
                    aria-label="Lý do giao không thành công"
                    className="h-8 w-full appearance-none rounded-md border border-gray-300 bg-white pl-2 pr-7 text-xs text-gray-700 outline-none focus:border-gray-500"
                  >
                    <option value="">Chọn lý do...</option>
                    {FAIL_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                </span>
              </div>
              <p className="text-[13px] font-medium text-red-700 underline">Giao không thành công - chọn lý do</p>
            </div>
          )}
        </div>
      </Modal>
    </DriverPhone>
  );
}

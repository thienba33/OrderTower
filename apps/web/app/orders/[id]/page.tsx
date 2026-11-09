"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ORDERS,
  ORDER_STATUSES,
  ORDER_STATUS_PILL,
  ORDER_TRUST_TEXT,
  formatMoney,
  type OrderStatus,
} from "@/data/orders";
import {
  addMinutes,
  fakeHash,
  getOrderDetail,
  type AuditEntry,
  type WorkflowEvent,
} from "@/data/order-detail";

export default function OrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const order = ORDERS.find((item) => item.id === id) ?? null;
  const detail = useMemo(() => (order ? getOrderDetail(order) : null), [order]);

  const [status, setStatus] = useState<OrderStatus>(detail?.order.status ?? "Mới tạo");
  const [events, setEvents] = useState<WorkflowEvent[]>(detail?.events ?? []);
  const [audit, setAudit] = useState<AuditEntry[]>(detail?.audit ?? []);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");

  useEffect(() => {
    if (detail) {
      setStatus(detail.order.status);
      setEvents(detail.events);
      setAudit(detail.audit);
    }
  }, [detail]);

  const nextOptions = useMemo(() => {
    const i = ORDER_STATUSES.indexOf(status);
    const options: { value: OrderStatus; label: string }[] = [];
    if (i >= 0 && i <= 6) {
      const next = ORDER_STATUSES[i + 1];
      options.push({ value: next, label: next === "Đã giao" ? "Đã giao (cần ảnh bằng chứng)" : next });
    }
    if (status !== "Hoàn" && status !== "Hủy") {
      options.push({ value: "Hủy", label: "Hủy đơn" });
    }
    return options;
  }, [status]);

  useEffect(() => {
    setNextStatus(nextOptions[0]?.value ?? "");
  }, [nextOptions]);

  if (!order || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Không tìm thấy đơn hàng</h1>
        <p className="text-sm text-gray-600">Mã đơn {id} không có trong dữ liệu mẫu.</p>
        <Link href="/orders" className="text-sm font-medium text-red-700 underline">
          Quay lại danh sách đơn hàng
        </Link>
      </div>
    );
  }

  const confirmTransition = () => {
    if (nextStatus === "") {
      return;
    }
    const time = addMinutes(events[events.length - 1].time, 30);
    const description =
      nextStatus === "Đã giao"
        ? "Đã giao kèm ảnh bằng chứng"
        : nextStatus === "Hủy"
          ? "Đơn đã hủy theo yêu cầu"
          : nextStatus === "Hoàn"
            ? "Đơn hoàn tất, đối soát COD xong"
            : `Sơn chuyển đơn sang ${nextStatus}`;
    setEvents((prev) => [
      ...prev.map((event) => ({ ...event, current: false })),
      { time, title: nextStatus, description, current: true },
    ]);
    setAudit((prev) => [
      ...prev,
      {
        time,
        actor: "Sơn",
        action: nextStatus === "Hủy" ? "Hủy đơn" : `Chuyển sang ${nextStatus}`,
        note: "Chuyển tay từ màn Chi tiết",
        hash: fakeHash(`${order.id}-t${prev.length}`),
      },
    ]);
    setStatus(nextStatus);
  };

  const infoRows: { label: string; value: string; tone?: string }[] = [
    { label: "Khách hàng", value: order.customer },
    { label: "SĐT", value: order.phone },
    { label: "Địa chỉ", value: detail.address },
    {
      label: "Độ tin cậy",
      value: `${detail.trustPercent}% - ${order.trust}${detail.trustNote}`,
      tone: ORDER_TRUST_TEXT[order.trust],
    },
    { label: "Mốc giao hẹn", value: `02/11/2026 ${order.deadline.slice(6)} - Kênh ${order.channel}` },
  ];

  const auditColumns: TableColumn<AuditEntry>[] = [
    { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "text-xs text-gray-700", headerClassName: "w-[139px]" },
    { key: "actor", header: "Người thực hiện", render: (row) => row.actor, cellClassName: "text-xs text-gray-700", headerClassName: "w-[179px]" },
    { key: "action", header: "Hành động", render: (row) => row.action, cellClassName: "text-xs text-gray-700", headerClassName: "w-[259px]" },
    { key: "note", header: "Lý do / ghi chú", render: (row) => row.note, cellClassName: "text-xs text-gray-700", headerClassName: "w-[259px]" },
    { key: "hash", header: "Hash", render: (row) => row.hash, cellClassName: "text-xs text-gray-700", headerClassName: "w-[318px]" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold text-gray-900">Chi tiết đơn hàng {order.id}</h1>
          <p className="text-xs text-gray-500">
            Kênh {order.channel} - Đặt lúc {detail.createdAt}, 02/11/2026 - Người tạo: Sơn (Điều phối viên)
          </p>
        </div>
        <span
          className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${ORDER_STATUS_PILL[status]}`}
        >
          {status}
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
            {detail.items.map((item) => (
              <div key={item.sku} className="flex flex-col gap-0.5">
                <p className="text-[13px] font-medium text-gray-900">
                  {item.name} ({item.sku})
                </p>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-gray-500">
                    Lô {item.lot}, HSD {item.expiry}
                  </p>
                  <p className="shrink-0 text-[13px] font-medium text-gray-800">
                    x{item.quantity} - {formatMoney(item.total)}
                  </p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-gray-700">Tổng tiền (COD)</p>
              <p className="text-sm font-semibold text-gray-900">{formatMoney(detail.total)}</p>
            </div>
          </div>
        </section>
      </div>

      <section aria-label="Lịch sử luồng" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Lịch sử luồng (Workflow) - quay lui có kiểm soát, mọi bước ghi log
        </h2>
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <div key={`${event.time}-${event.title}`} className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
              <p className="w-11 shrink-0 text-xs text-gray-500">{event.time}</p>
              <p
                className={`w-[180px] shrink-0 text-[13px] font-medium ${event.current ? "text-red-700" : "text-gray-900"}`}
              >
                {event.title}
              </p>
              <p className="min-w-0 flex-1 text-xs text-gray-600">{event.description}</p>
            </div>
          ))}
        </div>
      </section>

      {nextOptions.length > 0 && (
        <section aria-label="Chuyển trạng thái" className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Chuyển trạng thái tiếp theo</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-[280px] max-w-full">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
                aria-label="Chọn trạng thái tiếp theo"
                className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
              >
                {nextOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
              disabled={nextStatus === ""}
              onClick={confirmTransition}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận chuyển
            </button>
          </div>
        </section>
      )}

      <section aria-label="Audit log của đơn" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Audit log của đơn (hash nối chuỗi)
        </h2>
        <Table bare columns={auditColumns} rows={audit} rowKey={(row, index) => `${row.time}-${index}`} />
      </section>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DriverPhone, type DriverTab } from "@/components/driver/DriverPhone";
import {
  DRIVER_DATE,
  DRIVER_NAME,
  DRIVER_ORDERS,
  DRIVER_STATUS_PILL,
  DRIVER_VEHICLE,
  type DriverOrder,
} from "@/data/driver";

function MobileHeader({ title }: { title: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4">
      <Link href="/" aria-label="Quay lại Tổng quan" className="shrink-0 text-lg font-medium text-gray-700">
        {"<"}
      </Link>
      <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">{title}</p>
      <p className="shrink-0 text-[13px] text-gray-500">{DRIVER_VEHICLE}</p>
    </div>
  );
}

function ProgressCard({ orders }: { orders: DriverOrder[] }) {
  const delivered = orders.filter((order) => order.status === "Đã giao").length;
  const percent = orders.length === 0 ? 0 : Math.round((delivered / orders.length) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-[13px]">
        <p className="min-w-0 flex-1 font-medium text-gray-800">
          Đã giao {delivered}/{orders.length} đơn
        </p>
        <p className="shrink-0 font-semibold text-red-700">{percent}%</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-2 rounded-full bg-red-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OrderCard({
  order,
  primary,
  onStart,
}: {
  order: DriverOrder;
  primary: boolean;
  onStart: (id: string) => void;
}) {
  const buttonClass = `flex h-9 w-full items-center justify-center rounded-md text-sm font-medium ${
    primary ? "bg-red-700 text-white hover:bg-red-800" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
  }`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{order.id}</p>
        <span className={`flex h-[22px] shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-medium ${DRIVER_STATUS_PILL[order.status]}`}>
          {order.status}
        </span>
      </div>
      <p className="text-xs text-gray-600">{order.address}</p>
      <div className="flex items-center gap-2 text-xs">
        <p className="min-w-0 flex-1 text-gray-500">Mốc giao: {order.deadline}</p>
        <p className="shrink-0 text-gray-700">
          {order.sku} x{order.quantity}
        </p>
      </div>
      {order.status === "Chờ điều xe" ? (
        <button type="button" onClick={() => onStart(order.id)} className={buttonClass}>
          Bắt đầu giao
        </button>
      ) : (
        <Link href={`/driver/${order.id}`} className={buttonClass}>
          {order.status === "Đã giao" ? "Xem bằng chứng" : "Xem chi tiết"}
        </Link>
      )}
    </div>
  );
}

export default function DriverPage() {
  const [orders, setOrders] = useState<DriverOrder[]>(DRIVER_ORDERS);
  const [tab, setTab] = useState<DriverTab>("orders");

  // Nut do danh cho don dang giao va don cho dieu xe co moc giao som nhat;
  // cac don con lai dung nut trang.
  const earliestWaitingId = useMemo(() => {
    const waiting = orders.filter((order) => order.status === "Chờ điều xe").sort((a, b) => a.deadline.localeCompare(b.deadline));
    return waiting.length === 0 ? null : waiting[0].id;
  }, [orders]);

  const startDelivery = (id: string) => {
    setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, status: "Đang giao" } : order)));
  };

  const deliveredOrders = orders.filter((order) => order.status === "Đã giao");
  const deliveringCount = orders.filter((order) => order.status === "Đang giao").length;
  const waitingCount = orders.filter((order) => order.status === "Chờ điều xe").length;

  return (
    <DriverPhone activeTab={tab} onTab={setTab}>
      {tab === "orders" && (
        <>
          <MobileHeader title="Đơn của tôi" />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {DRIVER_NAME} - {DRIVER_DATE}
            </p>
            <ProgressCard orders={orders} />
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                primary={order.status === "Đang giao" || order.id === earliestWaitingId}
                onStart={startDelivery}
              />
            ))}
          </div>
        </>
      )}

      {tab === "history" && (
        <>
          <MobileHeader title="Lịch sử" />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {DRIVER_NAME} - {DRIVER_DATE}
            </p>
            {deliveredOrders.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có đơn đã giao.</p>
            ) : (
              deliveredOrders.map((order) => (
                <OrderCard key={order.id} order={order} primary={false} onStart={startDelivery} />
              ))
            )}
          </div>
        </>
      )}

      {tab === "profile" && (
        <>
          <MobileHeader title="Tôi" />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-base font-semibold text-gray-900">{DRIVER_NAME}</p>
              <p className="text-sm text-gray-500">Tài xế - {DRIVER_VEHICLE}</p>
              <p className="text-sm text-gray-500">{DRIVER_DATE}</p>
            </div>
            <ProgressCard orders={orders} />
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
              <p>Đang giao: {deliveringCount} đơn</p>
              <p>Chờ điều xe: {waitingCount} đơn</p>
              <p>Đã giao: {deliveredOrders.length} đơn</p>
            </div>
          </div>
        </>
      )}
    </DriverPhone>
  );
}

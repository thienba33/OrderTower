// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DriverPhone, type DriverTab } from "@/components/driver/DriverPhone";
import {
  ACTIVE_SHIPMENT_STATUSES,
  DRIVER_SHIPMENT_LABEL,
  DRIVER_SHIPMENT_PILL,
  FINISHED_SHIPMENT_STATUSES,
  type DriverListView,
  type DriverOrderCard,
} from "./driver-types";

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

function MobileHeader({ title, vehicleLabel }: { title: string; vehicleLabel: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4">
      <Link href="/" aria-label="Quay lại Tổng quan" className="shrink-0 text-lg font-medium text-gray-700">
        {"<"}
      </Link>
      <p className="min-w-0 flex-1 text-base font-semibold text-gray-900">{title}</p>
      <p className="shrink-0 text-[13px] text-gray-500">{vehicleLabel}</p>
    </div>
  );
}

function ProgressCard({ cards }: { cards: DriverOrderCard[] }) {
  const delivered = cards.filter((card) => card.shipmentStatus === "Đã giao").length;
  const percent = cards.length === 0 ? 0 : Math.round((delivered / cards.length) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-[13px]">
        <p className="min-w-0 flex-1 font-medium text-gray-800">
          Đã giao {delivered}/{cards.length} đơn
        </p>
        <p className="shrink-0 font-semibold text-red-700">{percent}%</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-2 rounded-full bg-red-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OrderCard({ card, primary }: { card: DriverOrderCard; primary: boolean }) {
  const buttonClass = `flex h-9 w-full items-center justify-center rounded-md text-sm font-medium ${
    primary ? "bg-red-700 text-white hover:bg-red-800" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
  }`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{card.orderId}</p>
        <span className={`flex h-[22px] shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-medium ${DRIVER_SHIPMENT_PILL[card.shipmentStatus]}`}>
          {DRIVER_SHIPMENT_LABEL[card.shipmentStatus]}
        </span>
      </div>
      <p className="text-xs text-gray-600">{card.address}</p>
      <div className="flex items-center gap-2 text-xs">
        <p className="min-w-0 flex-1 text-gray-500">Mốc giao: {formatTime(card.deadline)}</p>
        <p className="shrink-0 text-gray-700">{card.itemsText}</p>
      </div>
      <Link href={`/driver/${card.orderId}`} className={buttonClass}>
        {card.shipmentStatus === "Đã giao" ? "Xem bằng chứng" : "Xem chi tiết"}
      </Link>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500">{children}</p>
      <Link href="/api/auth/login" className="flex h-9 items-center justify-center rounded-md bg-red-700 text-sm font-medium text-white hover:bg-red-800">
        Đăng nhập
      </Link>
    </div>
  );
}

export default function DriverClient({ view }: { view: DriverListView }) {
  const [tab, setTab] = useState<DriverTab>("orders");

  if (view.kind === "login") {
    return (
      <DriverPhone activeTab="orders" onTab={setTab}>
        <MobileHeader title="Đơn của tôi" vehicleLabel="" />
        <div className="h-px shrink-0 bg-gray-200" />
        <Notice title="Chưa đăng nhập">
          Bạn chưa đăng nhập. Đăng nhập để xem đơn giao hàng của bạn.
        </Notice>
      </DriverPhone>
    );
  }

  if (view.kind === "no-driver") {
    return (
      <DriverPhone activeTab="orders" onTab={setTab}>
        <MobileHeader title="Đơn của tôi" vehicleLabel="" />
        <div className="h-px shrink-0 bg-gray-200" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h1 className="text-base font-semibold text-gray-900">Chưa gắn tài xế</h1>
          <p className="text-sm text-gray-500">
            Tài khoản này chưa gắn với tài xế nào.
          </p>
        </div>
      </DriverPhone>
    );
  }

  if (view.kind === "error") {
    return (
      <DriverPhone activeTab="orders" onTab={setTab}>
        <MobileHeader title="Đơn của tôi" vehicleLabel="" />
        <div className="h-px shrink-0 bg-gray-200" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h1 className="text-base font-semibold text-gray-900">Không tải được danh sách</h1>
          <p className="text-sm text-gray-500">{view.message}</p>
        </div>
      </DriverPhone>
    );
  }

  return <DriverListOk view={view} />;
}

function DriverListOk({ view }: { view: Extract<DriverListView, { kind: "ok" }> }) {
  const [tab, setTab] = useState<DriverTab>("orders");
  const { driver, vehicleLabel, dateLabel, cards, loadNote } = view;
  const activeCards = cards.filter((card) => ACTIVE_SHIPMENT_STATUSES.includes(card.shipmentStatus));
  const finishedCards = cards.filter((card) => FINISHED_SHIPMENT_STATUSES.includes(card.shipmentStatus));
  const deliveringCount = cards.filter((card) => card.shipmentStatus === "Đang giao").length;
  const waitingCount = cards.filter((card) => card.shipmentStatus === "Chờ điều xe").length;
  const deliveredCount = cards.filter((card) => card.shipmentStatus === "Đã giao").length;
  const failedCount = cards.filter((card) => card.shipmentStatus === "Giao thất bại").length;

  // Nút đỏ cho đơn đang giao và đơn chờ điều xe có mốc giao sớm nhất.
  const earliestWaitingId = useMemo(() => {
    const waiting = activeCards.filter((card) => card.shipmentStatus === "Chờ điều xe");
    return waiting.length === 0 ? null : waiting[0].orderId;
  }, [activeCards]);

  return (
    <DriverPhone activeTab={tab} onTab={setTab}>
      {tab === "orders" && (
        <>
          <MobileHeader title="Đơn của tôi" vehicleLabel={vehicleLabel} />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {driver.name} - {dateLabel}
            </p>
            <ProgressCard cards={cards} />
            {loadNote !== null && (
              <p className="text-xs text-gray-500">{loadNote}</p>
            )}
            {activeCards.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có đơn đang giao.</p>
            ) : (
              activeCards.map((card) => (
                <OrderCard
                  key={card.shipmentId}
                  card={card}
                  primary={card.shipmentStatus === "Đang giao" || card.orderId === earliestWaitingId}
                />
              ))
            )}
          </div>
        </>
      )}

      {tab === "history" && (
        <>
          <MobileHeader title="Lịch sử" vehicleLabel={vehicleLabel} />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {driver.name} - {dateLabel}
            </p>
            {finishedCards.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có đơn đã giao.</p>
            ) : (
              finishedCards.map((card) => (
                <OrderCard key={card.shipmentId} card={card} primary={false} />
              ))
            )}
          </div>
        </>
      )}

      {tab === "profile" && (
        <>
          <MobileHeader title="Tôi" vehicleLabel={vehicleLabel} />
          <div className="h-px shrink-0 bg-gray-200" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-base font-semibold text-gray-900">{driver.name}</p>
              <p className="text-sm text-gray-500">Tài xế - {vehicleLabel}</p>
              <p className="text-sm text-gray-500">SĐT: {driver.phone}</p>
              <p className="text-sm text-gray-500">
                Trạng thái: {driver.status} - {dateLabel}
              </p>
            </div>
            <ProgressCard cards={cards} />
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
              <p>Đang giao: {deliveringCount} đơn</p>
              <p>Chờ điều xe: {waitingCount} đơn</p>
              <p>Đã giao: {deliveredCount} đơn</p>
              <p>Giao không thành công: {failedCount} đơn</p>
            </div>
          </div>
        </>
      )}
    </DriverPhone>
  );
}

"use client";

// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { useMemo, useState } from "react";
import { ORDER_STATUS_PILL, formatMoney } from "../../data/orders";
import type { OrderDetail } from "../../data/order-detail";
import {
  TRACKING_PRODUCT_NAMES,
  buildTrackingSteps,
  findTrackedOrder,
  trackingDriver,
  type TrackingStep,
} from "../../data/tracking";

function StepDot({ state }: { state: TrackingStep["state"] }) {
  if (state === "done") {
    return <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-green-600" />;
  }
  if (state === "current") {
    return <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-red-700" />;
  }
  return <span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-gray-300 bg-white" />;
}

export default function TheoDoiPage() {
  const [query, setQuery] = useState("DH-1044");
  const [detail, setDetail] = useState<OrderDetail | null>(() => findTrackedOrder("DH-1044"));
  const [searched, setSearched] = useState("DH-1044");
  const [notFound, setNotFound] = useState(false);

  const steps = useMemo(() => (detail ? buildTrackingSteps(detail) : []), [detail]);
  const driver = useMemo(() => (detail ? trackingDriver(detail) : null), [detail]);

  const lookup = () => {
    const found = findTrackedOrder(query);
    setSearched(query.trim().toUpperCase());
    setDetail(found);
    setNotFound(!found);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Theo dõi đơn hàng</h1>

      <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") lookup();
          }}
          placeholder="Nhập mã đơn, ví dụ DH-1044"
          aria-label="Mã đơn cần tra cứu"
          className="h-11 w-[480px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={lookup}
          className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
        >
          Tra cứu
        </button>
      </div>

      {notFound && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-medium text-gray-900">Không tìm thấy đơn {searched}</p>
          <p className="mt-1 text-sm text-gray-500">Kiểm tra lại mã đơn, ví dụ DH-1044.</p>
        </div>
      )}

      {detail && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-lg font-semibold text-gray-900">Đơn hàng {detail.order.id}</h2>
              <span
                className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${ORDER_STATUS_PILL[detail.order.status]}`}
              >
                {detail.order.status}
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

          <div className="flex flex-col gap-3 xl:flex-row">
            <section className="min-w-0 flex-1 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Hàng hóa</h2>
              <div className="mt-3 flex flex-col gap-3">
                {detail.items.map((item) => (
                  <div key={item.sku} className="flex items-center gap-2 text-[13px] text-gray-800">
                    <p className="min-w-0 flex-1">{TRACKING_PRODUCT_NAMES[item.sku] ?? item.name}</p>
                    <p className="shrink-0 font-medium">
                      x{item.quantity} - {formatMoney(item.total)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] font-medium text-gray-700">Tổng tiền (COD)</p>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">{formatMoney(detail.total)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-white p-4 xl:w-[468px] xl:shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Giao hàng</h2>
              <p className="mt-3 text-[13px] text-gray-800">
                Tài xế: {driver ? `${driver} - Xe 01` : "Chưa điều xe"}
              </p>
              <p className="mt-1 text-xs text-gray-500">Địa chỉ giao: {detail.address}</p>
            </section>
          </div>

          <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-900">Ảnh bằng chứng giao hàng</h2>
            {detail.order.status === "Đã giao" || detail.order.status === "Hoàn" ? (
              <p className="mt-2 text-xs text-gray-500">Đã giao kèm ảnh bằng chứng, ảnh lưu trong hồ sơ đơn.</p>
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

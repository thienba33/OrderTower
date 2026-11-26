// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

export type DriverTab = "orders" | "history" | "profile";

const TABS: { key: DriverTab; label: string }[] = [
  { key: "orders", label: "Đơn" },
  { key: "history", label: "Lịch sử" },
  { key: "profile", label: "Tôi" },
];

// Khung dien thoai 390px dung chung cho cac man Tai xe: noi dung truyen vao
// children, dieu huong duoi co dinh 3 muc.
export function DriverPhone({
  activeTab,
  onTab,
  children,
}: {
  activeTab: DriverTab;
  onTab: (tab: DriverTab) => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      {children}
      <div className="h-px shrink-0 bg-gray-200" />
      <nav className="flex h-14 shrink-0 items-center justify-center gap-3 px-4 text-center text-[13px]" aria-label="Điều hướng tài xế">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onTab(item.key)}
            aria-current={activeTab === item.key ? "page" : undefined}
            className={`min-w-0 flex-1 ${activeTab === item.key ? "font-semibold text-red-700" : "text-gray-500"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

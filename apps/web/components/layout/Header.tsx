"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { Menu } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white px-5">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Mở menu"
        className="rounded-md p-2 hover:bg-gray-100 md:hidden"
      >
        <Menu size={20} />
      </button>
      <p className="hidden shrink-0 text-sm text-gray-500 lg:block">
        Thứ Hai, ngày 02 tháng 11 năm 2026
      </p>
      <div className="flex-1" />
      <div className="hidden w-[288px] shrink-0 md:block">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Tìm mã đơn, khách hàng"
          ariaLabel="Tìm mã đơn, khách hàng"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-700 text-sm font-medium text-white">
          S
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight text-gray-900">
            Son
          </p>
          <p className="truncate text-xs leading-tight text-gray-500">
            Điều phối viên
          </p>
        </div>
      </div>
    </header>
  );
}

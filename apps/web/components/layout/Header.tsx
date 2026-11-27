"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import type { Session } from "@/lib/auth";

export function Header({
  onMenuClick,
  session,
  unreadCount = 0,
}: {
  onMenuClick: () => void;
  session?: Session | null;
  unreadCount?: number;
}) {
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
      {session ? (
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/notifications"
            aria-label={
              unreadCount > 0
                ? `Thông báo, ${unreadCount} chưa đọc`
                : "Thông báo"
            }
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <Bell size={18} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-700 text-sm font-medium text-white">
            {session.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-gray-900">
              {session.username}
            </p>
            {session.roles.length > 0 ? (
              <p className="truncate text-xs leading-tight text-gray-500">
                {session.roles[0]}
              </p>
            ) : null}
          </div>
          <a
            href="/api/auth/logout"
            className="ml-1 text-sm text-gray-500 underline hover:text-gray-900"
          >
            Đăng xuất
          </a>
        </div>
      ) : (
        <a
          href="/api/auth/login"
          className="flex h-9 shrink-0 items-center rounded-md bg-red-700 px-3.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Đăng nhập
        </a>
      )}
    </header>
  );
}

"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { NAV_SECTIONS, NAV_TOP, type NavLeaf } from "./navigation";

function NavRow({ item, onNavigate }: { item: NavLeaf; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex h-10 items-center gap-3 rounded-md bg-red-700 px-3 text-sm font-medium text-white"
          : "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-gray-800 hover:bg-gray-100"
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span
          className={
            active
              ? "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-medium text-red-700"
              : "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-700 px-1 text-[11px] font-medium text-white"
          }
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarBody({
  headerAction,
  onNavigate,
}: {
  headerAction?: ReactNode;
  onNavigate?: () => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_SECTIONS.map((section) => [section.label, true])),
  );

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-700 text-[15px] font-medium text-white">
          T
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-gray-900">
            OrderTower
          </p>
          <p className="truncate text-[11px] leading-tight text-gray-500">
            Điều hành đơn hàng
          </p>
        </div>
        {headerAction}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          <li>
            <NavRow item={NAV_TOP} onNavigate={onNavigate} />
          </li>
          {NAV_SECTIONS.map((section) => {
            const open = openSections[section.label] ?? true;
            return (
              <li key={section.label} className="space-y-1">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenSections((prev) => ({ ...prev, [section.label]: !open }))
                  }
                  className="flex h-9 w-full items-center justify-between px-3 text-left text-xs font-medium text-gray-500"
                >
                  {section.label}
                  <ChevronDown
                    size={14}
                    className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
                  />
                </button>
                {open && (
                  <ul className="space-y-1 pl-3">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <NavRow item={item} onNavigate={onNavigate} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t px-3 py-3">
        <p className="text-[11px] font-medium leading-relaxed text-gray-900">
          OrderTower · Bản mô phỏng
        </p>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Dữ liệu mẫu đóng băng 02/11/2026
        </p>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Chưa nối hệ thống thật
        </p>
      </div>
    </>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-white md:flex">
        <SidebarBody />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={onClose}
            className="absolute inset-0 h-full w-full bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 flex h-full w-60 flex-col bg-white">
            <SidebarBody
              onNavigate={onClose}
              headerAction={
                <button
                  type="button"
                  aria-label="Đóng menu"
                  onClick={onClose}
                  className="rounded-md p-2 hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              }
            />
          </aside>
        </div>
      )}
    </>
  );
}

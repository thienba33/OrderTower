// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "OrderTower",
};

// Chuông thông báo cần số chưa đọc ở mọi màn. API lỗi/session hết hạn không
// được làm hỏng layout; chỉ hiển thị 0 và để trang tự xử lý 401.
async function unreadNotifications(): Promise<number> {
  try {
    const response = await apiFetch("/notifications?limit=1");
    if (!response.ok) {
      return 0;
    }
    const data: unknown = await response.json();
    const count = (data as { unreadCount?: unknown } | null)?.unreadCount;
    return typeof count === "number" && Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const unreadCount = session ? await unreadNotifications() : 0;

  return (
    <html lang="vi">
      <body className="bg-white font-sans text-gray-900 antialiased">
        <Shell session={session} unreadCount={unreadCount}>
          {children}
        </Shell>
      </body>
    </html>
  );
}

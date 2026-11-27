"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import type { Session } from "@/lib/auth";

export function Shell({
  children,
  session,
  unreadCount = 0,
}: {
  children: ReactNode;
  session?: Session | null;
  unreadCount?: number;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          session={session}
          unreadCount={unreadCount}
        />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

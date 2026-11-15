"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import type { Session } from "@/lib/auth";

export function Shell({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} session={session} />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

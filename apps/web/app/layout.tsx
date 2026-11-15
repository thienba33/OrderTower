// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "OrderTower",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="vi">
      <body className="bg-white font-sans text-gray-900 antialiased">
        <Shell session={session}>{children}</Shell>
      </body>
    </html>
  );
}

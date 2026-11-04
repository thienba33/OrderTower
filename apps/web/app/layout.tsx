// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";

export const metadata: Metadata = {
  title: "OrderTower",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-white font-sans text-gray-900 antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

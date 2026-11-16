// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import TrackingClient from "./tracking-client";

// Tra cứu đơn cần đăng nhập vì API chỉ mở GET /api/health cho khách vãng
// lai, mọi endpoint đơn/sự kiện/shipment đều cần token. Muốn khách tra cứu
// không cần đăng nhập thì cần thêm endpoint công khai ở API, làm riêng sau.
export default async function TrackingPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Theo dõi đơn hàng</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để tra cứu đơn hàng từ API.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/tracking", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Theo dõi đơn hàng" />;
  }

  return <TrackingClient />;
}

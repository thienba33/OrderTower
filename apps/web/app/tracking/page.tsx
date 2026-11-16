// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
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
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/tracking", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Theo dõi đơn hàng" />;
  }

  return <TrackingClient />;
}

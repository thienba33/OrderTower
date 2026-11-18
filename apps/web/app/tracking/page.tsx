// SPDX-License-Identifier: Apache-2.0
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import TrackingClient from "./tracking-client";

// Theo dõi đơn hàng mở cho khách vãng lai: endpoint công khai chỉ cần mã
// đơn + SĐT lúc đặt đơn, không cần đăng nhập. Người đã đăng nhập vẫn qua
// kiểm tra vai như mọi màn; khách chưa đăng nhập xem trực tiếp, không
// chuyển sang trang đăng nhập.
export default async function TrackingPage() {
  const session = await getSession();

  if (session && !canAccessScreen("/tracking", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Theo dõi đơn hàng" />;
  }

  return <TrackingClient />;
}

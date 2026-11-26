// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Màn Telesale đã gộp hẳn vào màn Chăm sóc khách hàng (mục Cuộc gọi):
// đơn ưu tiên gọi, chia đơn, việc của tôi, tổng quan đội và nhân viên
// giờ nằm ở /customer-care. Giữ route này chỉ để chuyển hướng, ai mở
// link cũ cũng về đúng màn mới.
export default async function TelesalePage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }
  redirect("/customer-care");
}

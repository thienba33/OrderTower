// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import AddressSplitClient from "./address-split-client";
import type { ApiOrderDetail } from "../orders/[id]/order-detail-types";
import type { ApiWorkflowTransition } from "../orders/[id]/order-detail-types";

// Lấy danh sách đơn từ API. Lỗi HTTP hoặc dữ liệu không phải mảng thì
// ném ApiError để trang quyết định hiện nhắc đăng nhập hay báo lỗi.
async function fetchOrders(): Promise<ApiOrderDetail[]> {
  const response = await apiFetch("/orders");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiOrderDetail[];
}

// Lấy định nghĩa luồng để biết bước tiếp theo của mỗi đơn (xác nhận hàng
// loạt ở tab Xác nhận). Lỗi thì trả [] để trang vẫn hiện, chỉ ẩn chức
// năng xác nhận hàng loạt.
async function fetchTransitions(): Promise<ApiWorkflowTransition[]> {
  try {
    const response = await apiFetch(
      "/workflow/definition?definitionId=order-flow",
    );
    if (!response.ok) {
      return [];
    }
    const data: unknown = await response.json();
    if (
      data === null ||
      typeof data !== "object" ||
      !Array.isArray((data as { transitions?: unknown }).transitions)
    ) {
      return [];
    }
    return (data as { transitions: ApiWorkflowTransition[] }).transitions;
  } catch {
    return [];
  }
}

export default async function AddressSplitPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/address-split", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Phân tách địa chỉ" />;
  }

  let orders: ApiOrderDetail[];
  try {
    orders = await fetchOrders();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-bold text-gray-900">Phân tách địa chỉ</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem đơn chờ tách địa chỉ từ API.
          </p>
        </div>
      );
    }
    const message = error instanceof Error ? error.message : "Không tải được danh sách đơn.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-bold text-gray-900">Phân tách địa chỉ</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được danh sách đơn: {message}
        </p>
      </div>
    );
  }

  const transitions = await fetchTransitions();
  return (
    <AddressSplitClient orders={orders} transitions={transitions} roles={session.roles} />
  );
}

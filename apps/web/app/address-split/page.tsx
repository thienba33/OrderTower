// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import AddressSplitClient from "./address-split-client";
import type { ApiOrderDetail } from "../orders/[id]/order-detail-types";

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

export default async function AddressSplitPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-bold text-gray-900">Phân tách địa chỉ</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem đơn chờ tách địa chỉ từ API.
        </p>
      </div>
    );
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

  return <AddressSplitClient orders={orders} />;
}

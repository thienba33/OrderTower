// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import OrdersClient from "./orders-client";
import type { ApiChannel, ApiInventoryItem, ApiOrder } from "./orders-types";

// Lấy 1 danh sách từ API. Lỗi HTTP hoặc dữ liệu không phải mảng thì ném
// ApiError để trang quyết định hiện nhắc đăng nhập hay báo lỗi.
async function fetchList<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T[];
}

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Đơn hàng</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem đơn hàng từ API.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/orders", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Đơn hàng" />;
  }

  let orders: ApiOrder[];
  let channels: ApiChannel[];
  let products: ApiInventoryItem[];
  try {
    [orders, channels, products] = await Promise.all([
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiChannel>("/channels"),
      fetchList<ApiInventoryItem>("/inventory"),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Đơn hàng</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem đơn hàng từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được danh sách đơn hàng.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Đơn hàng</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được danh sách đơn hàng: {message}
        </p>
      </div>
    );
  }

  return <OrdersClient orders={orders} channels={channels} products={products} />;
}

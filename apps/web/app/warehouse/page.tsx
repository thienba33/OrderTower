// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import WarehouseClient from "./warehouse-client";
import type { ApiInventoryItem } from "./warehouse-types";

// Lấy danh sách tồn kho từ API. Lỗi HTTP hoặc dữ liệu không phải mảng thì
// ném ApiError để trang quyết định hiện nhắc đăng nhập hay báo lỗi.
async function fetchInventory(): Promise<ApiInventoryItem[]> {
  const response = await apiFetch("/inventory");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiInventoryItem[];
}

export default async function KhoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/warehouse", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Kho và tồn kho - Kho duy nhất" />;
  }

  let items: ApiInventoryItem[];
  try {
    items = await fetchInventory();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Kho và tồn kho - Kho duy nhất</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem tồn kho từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được danh sách tồn kho.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Kho và tồn kho - Kho duy nhất</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được danh sách tồn kho: {message}
        </p>
      </div>
    );
  }

  return <WarehouseClient items={items} />;
}

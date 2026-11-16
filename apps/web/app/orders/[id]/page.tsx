// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import OrderDetailClient from "./order-detail-client";
import type {
  ApiAuditRecord,
  ApiOrderDetail,
  ApiWorkflowDefinition,
} from "./order-detail-types";
import type { ApiChannel, ApiInventoryItem } from "../orders-types";

// Gọi API, lỗi mạng thì trả null để trang quyết định hiện báo lỗi.
async function safeFetch(path: string): Promise<Response | null> {
  try {
    return await apiFetch(path);
  } catch {
    return null;
  }
}

function notFoundView(id: string) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Không tìm thấy đơn hàng</h1>
      <p className="text-sm text-gray-600">Mã đơn {id} không có trong hệ thống.</p>
      <Link href="/orders" className="text-sm font-medium text-red-700 underline">
        Quay lại danh sách đơn hàng
      </Link>
    </div>
  );
}

function loginView(message: string) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Chi tiết đơn hàng</h1>
      <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        {message}{" "}
        <Link href="/api/auth/login" className="font-medium text-red-700 underline">
          Đăng nhập
        </Link>{" "}
        để xem chi tiết đơn hàng từ API.
      </p>
    </div>
  );
}

function errorView(message: string) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Chi tiết đơn hàng</h1>
      <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        Không tải được chi tiết đơn hàng: {message}
      </p>
    </div>
  );
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const session = await getSession();
  if (!session) {
    return loginView("Bạn chưa đăng nhập.");
  }

  const [orderRes, definitionRes, auditRes, channelRes, inventoryRes] =
    await Promise.all([
      safeFetch(`/orders/${encodeURIComponent(id)}`),
      safeFetch("/workflow/definition?definitionId=order-flow"),
      safeFetch("/audit"),
      safeFetch("/channels"),
      safeFetch("/inventory"),
    ]);

  // Kiểm tra đơn trước: 404 thì hiện khung không tìm thấy, 401 thì nhắc
  // đăng nhập lại, lỗi khác thì báo lỗi. Chỉ khi đơn tải được mới xét
  // các danh sách còn lại.
  if (orderRes === null || !orderRes.ok) {
    if (orderRes?.status === 404) {
      return notFoundView(id);
    }
    if (orderRes?.status === 401) {
      return loginView("Phiên đăng nhập đã hết hạn.");
    }
    return errorView(
      orderRes ? `API trả về ${orderRes.status}.` : "Không gọi được API.",
    );
  }
  if (
    definitionRes === null ||
    !definitionRes.ok ||
    auditRes === null ||
    !auditRes.ok ||
    channelRes === null ||
    !channelRes.ok ||
    inventoryRes === null ||
    !inventoryRes.ok
  ) {
    return errorView("API trả về lỗi khi tải dữ liệu phụ cho trang chi tiết.");
  }

  const order: unknown = await orderRes.json().catch(() => null);
  const definition: unknown = await definitionRes.json().catch(() => null);
  const audit: unknown = await auditRes.json().catch(() => null);
  const channels: unknown = await channelRes.json().catch(() => null);
  const products: unknown = await inventoryRes.json().catch(() => null);
  if (
    order === null ||
    typeof order !== "object" ||
    definition === null ||
    typeof definition !== "object" ||
    !Array.isArray((definition as ApiWorkflowDefinition).transitions) ||
    !Array.isArray(audit) ||
    !Array.isArray(channels) ||
    !Array.isArray(products)
  ) {
    return errorView("API trả về dữ liệu không đúng dạng.");
  }

  const typedOrder = order as ApiOrderDetail;
  const typedDefinition = definition as ApiWorkflowDefinition;
  return (
    <OrderDetailClient
      order={typedOrder}
      transitions={typedDefinition.transitions}
      roles={session.roles}
      audit={(audit as ApiAuditRecord[]).filter((record) => record.orderId === id)}
      channels={channels as ApiChannel[]}
      products={products as ApiInventoryItem[]}
    />
  );
}

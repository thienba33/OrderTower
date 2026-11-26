// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import DistributionClient from "./distribution-client";
import type {
  ApiAssignment,
  ApiOrder,
  DistributionError,
} from "./distribution-types";

// Lấy danh sách từ API, trả về mảng đã kiểm tra dạng.
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

export default async function DistributionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/distribution", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Phân phối đơn hàng" />;
  }

  // Đơn và phân đơn kho là dữ liệu chính của màn: lỗi tải thì hiện
  // trạng thái lỗi ở bảng, không chặn trang.
  let orders: ApiOrder[] = [];
  let assignments: ApiAssignment[] = [];
  let distributionError: DistributionError | null = null;
  try {
    const [orderList, assignmentList] = await Promise.all([
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiAssignment>("/assignments?kind=warehouse"),
    ]);
    orders = orderList;
    assignments = assignmentList;
  } catch (error) {
    distributionError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  return (
    <DistributionClient
      orders={orders}
      assignments={assignments}
      distributionError={distributionError}
      roles={session.roles}
    />
  );
}

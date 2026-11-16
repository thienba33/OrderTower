// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import ApprovalQueueClient from "./approval-queue-client";
import type { ApiApproval } from "./approval-queue-types";

// Lấy toàn bộ yêu cầu duyệt từ API rồi lọc ở client cho tab/tìm kiếm.
async function fetchApprovals(): Promise<ApiApproval[]> {
  const response = await apiFetch("/approvals");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiApproval[];
}

export default async function ApprovalQueuePage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi duyệt</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem hàng đợi duyệt từ API.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/approval-queue", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Hàng đợi duyệt" />;
  }

  let approvals: ApiApproval[];
  try {
    approvals = await fetchApprovals();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi duyệt</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem hàng đợi duyệt từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được hàng đợi duyệt.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi duyệt</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được hàng đợi duyệt: {message}
        </p>
      </div>
    );
  }

  return (
    <ApprovalQueueClient
      approvals={approvals}
      username={session.username}
      roles={session.roles}
    />
  );
}

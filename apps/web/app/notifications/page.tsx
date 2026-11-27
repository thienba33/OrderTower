// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import NotificationsClient from "./notifications-client";
import type { ApiNotificationList } from "./notification-types";

async function fetchNotifications(): Promise<ApiNotificationList> {
  const response = await apiFetch("/notifications?limit=100");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as { items?: unknown }).items)
  ) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiNotificationList;
}

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }
  if (!canAccessScreen("/notifications", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Thông báo" />;
  }

  let data: ApiNotificationList;
  try {
    data = await fetchNotifications();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không tải được thông báo.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Thông báo</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được thông báo: {message}
        </p>
        <Link
          href="/"
          className="w-fit text-sm font-medium text-red-700 underline"
        >
          Về tổng quan
        </Link>
      </div>
    );
  }

  return (
    <NotificationsClient
      initialData={data}
      username={session.username}
      roles={session.roles}
    />
  );
}

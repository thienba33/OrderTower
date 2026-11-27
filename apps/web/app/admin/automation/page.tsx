// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import type { ApiNotificationPage } from "../../notifications/notification-types";
import AutomationClient from "./automation-client";
import type {
  ApiAutomationRunPage,
  ApiAutomationStatus,
} from "./automation-types";
import {
  NOTIFICATION_PAGE_SIZE,
  RUN_PAGE_SIZE,
} from "./automation-types";

async function fetchJson(path: string): Promise<unknown> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  return response.json().catch(() => null);
}

export default async function AutomationPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }
  if (!canAccessScreen("/admin/automation", session.roles)) {
    return (
      <AccessDenied roles={session.roles} screenLabel="Tự động hóa hệ thống" />
    );
  }

  let status: ApiAutomationStatus;
  let runs: ApiAutomationRunPage;
  let notifications: ApiNotificationPage;
  try {
    const [statusRaw, runsRaw, notificationsRaw] = await Promise.all([
      fetchJson("/automation/status"),
      fetchJson(`/automation/runs?limit=${RUN_PAGE_SIZE}&offset=0`),
      fetchJson(
        `/automation/notifications?limit=${NOTIFICATION_PAGE_SIZE}&offset=0`,
      ),
    ]);
    if (
      !statusRaw ||
      typeof statusRaw !== "object" ||
      !Array.isArray((statusRaw as { jobs?: unknown }).jobs)
    ) {
      throw new ApiError(0, "API trả về trạng thái automation không đúng dạng.");
    }
    if (!isPage(runsRaw) || !isPage(notificationsRaw)) {
      throw new ApiError(0, "API trả về run log không đúng dạng phân trang.");
    }
    status = statusRaw as ApiAutomationStatus;
    runs = runsRaw as ApiAutomationRunPage;
    notifications = notificationsRaw as ApiNotificationPage;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không tải được automation.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Tự động hóa hệ thống
        </h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được automation: {message}
        </p>
        <Link
          href="/admin"
          className="w-fit text-sm font-medium text-red-700 underline"
        >
          Về quản trị hệ thống
        </Link>
      </div>
    );
  }

  return (
    <AutomationClient
      initialStatus={status}
      initialRuns={runs}
      initialNotifications={notifications}
    />
  );
}

function isPage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const page = value as {
    items?: unknown;
    total?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  return (
    Array.isArray(page.items) &&
    typeof page.total === "number" &&
    typeof page.limit === "number" &&
    typeof page.offset === "number"
  );
}

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import ColdDataClient from "./cold-data-client";
import type {
  ApiArchiveRun,
  ApiArchiveSummary,
  ApiColdAnalytics,
} from "./cold-data-types";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  return (await response.json()) as T;
}

export default async function ColdDataPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/cold-data", session.roles)) {
    return (
      <AccessDenied
        roles={session.roles}
        screenLabel="Kho dữ liệu lạnh"
      />
    );
  }

  let summary: ApiArchiveSummary;
  let runs: ApiArchiveRun[];
  let analytics: ApiColdAnalytics;
  try {
    [summary, runs, analytics] = await Promise.all([
      fetchJson<ApiArchiveSummary>("/archive/summary"),
      fetchJson<ApiArchiveRun[]>("/archive/runs?limit=10"),
      fetchJson<ApiColdAnalytics>("/archive/orders/analytics?limit=20"),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Kho dữ liệu lạnh
          </h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link
              href="/api/auth/login"
              className="font-medium text-red-700 underline"
            >
              Đăng nhập lại
            </Link>{" "}
            để xem dữ liệu lạnh.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được dữ liệu lạnh.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Kho dữ liệu lạnh
        </h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được dữ liệu lạnh: {message}
        </p>
      </div>
    );
  }

  const canArchive = session.roles.some((role) =>
    ["Quản trị viên", "Quản lý"].includes(role),
  );

  return (
    <ColdDataClient
      initialSummary={summary}
      initialRuns={runs}
      initialAnalytics={analytics}
      canArchive={canArchive}
    />
  );
}

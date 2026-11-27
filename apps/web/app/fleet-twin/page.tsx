// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import FleetTwinClient from "./fleet-twin-client";
import type { ApiVehicleTwin } from "./fleet-twin-types";

async function fetchTwins(): Promise<ApiVehicleTwin[]> {
  const response = await apiFetch("/twins/vehicles");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiVehicleTwin[];
}

export default async function FleetTwinPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/fleet-twin", session.roles)) {
    return (
      <AccessDenied
        roles={session.roles}
        screenLabel="Giám sát đội xe"
      />
    );
  }

  let twins: ApiVehicleTwin[];
  try {
    twins = await fetchTwins();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Giám sát đội xe
          </h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link
              href="/api/auth/login"
              className="font-medium text-red-700 underline"
            >
              Đăng nhập lại
            </Link>{" "}
            để xem trạng thái đội xe.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được trạng thái twin.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Giám sát đội xe
        </h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được trạng thái twin: {message}
        </p>
      </div>
    );
  }

  const canSimulate = session.roles.some((role) =>
    ["Quản trị viên", "Quản lý", "Điều phối viên"].includes(role),
  );

  return (
    <FleetTwinClient
      initialTwins={twins}
      canSimulate={canSimulate}
    />
  );
}

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import DistributionClient from "./distribution-client";

export default async function DistributionPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-bold text-gray-900">Phân phối đơn hàng</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem phân phối đơn hàng.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/distribution", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Phân phối đơn hàng" />;
  }

  return <DistributionClient />;
}

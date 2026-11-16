// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import BiDxScoreClient from "./bi-dx-score-client";

export default async function BiDxScorePage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">BI và DX-Score</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem BI và DX-Score.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/bi-dx-score", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="BI và DX-Score" />;
  }

  return <BiDxScoreClient />;
}

// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import BiDxScoreClient from "./bi-dx-score-client";

export default async function BiDxScorePage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/bi-dx-score", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="BI và DX-Score" />;
  }

  return <BiDxScoreClient />;
}

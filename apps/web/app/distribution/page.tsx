// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import DistributionClient from "./distribution-client";

export default async function DistributionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/distribution", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Phân phối đơn hàng" />;
  }

  return <DistributionClient />;
}

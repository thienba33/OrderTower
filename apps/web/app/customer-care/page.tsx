// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import CskhClient from "./customer-care-client";

export default async function CskhPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/customer-care", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Chăm sóc khách hàng" />;
  }

  return <CskhClient />;
}

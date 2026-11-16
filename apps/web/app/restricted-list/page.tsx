// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import RestrictedListClient from "./restricted-list-client";

export default async function RestrictedListPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/restricted-list", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Danh sách hạn chế" />;
  }

  return <RestrictedListClient />;
}

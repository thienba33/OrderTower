// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import RestrictedListClient from "./restricted-list-client";
import type {
  ApiChannel,
  ApiInventoryItem,
  ApiRestrictedFlagDetail,
  RestrictedFlagsError,
} from "./restricted-list-types";

// Lấy danh sách từ API, trả về mảng đã kiểm tra dạng.
async function fetchList<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T[];
}

export default async function RestrictedListPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/restricted-list", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Danh sách hạn chế" />;
  }

  // Danh sách cờ là dữ liệu chính của màn: lỗi tải thì hiện trạng thái
  // lỗi ở bảng, không chặn trang. Kênh và tồn kho chỉ để tra tên hiển
  // thị, tra không ra thì màn vẫn hiện mã kênh/SKU.
  let flags: ApiRestrictedFlagDetail[] = [];
  let channelNames: Record<string, string> = {};
  let productNames: Record<string, string> = {};
  let flagsError: RestrictedFlagsError | null = null;
  try {
    const [flagList, channels, products] = await Promise.all([
      fetchList<ApiRestrictedFlagDetail>("/restricted-flags"),
      fetchList<ApiChannel>("/channels"),
      fetchList<ApiInventoryItem>("/inventory"),
    ]);
    flags = flagList;
    channelNames = Object.fromEntries(
      channels.map((channel) => [channel.id, channel.name]),
    );
    productNames = Object.fromEntries(
      products.map((product) => [product.sku, product.name]),
    );
  } catch (error) {
    flagsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  return (
    <RestrictedListClient
      flags={flags}
      channelNames={channelNames}
      productNames={productNames}
      flagsError={flagsError}
      roles={session.roles}
    />
  );
}

// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import CskhClient from "./customer-care-client";
import type {
  ApiChannel,
  ApiOrder,
  ApiReturn,
  ReturnChannelStat,
  ReturnsError,
} from "./customer-care-types";

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

// Tính hoàn hàng theo từng kênh từ 3 danh sách API: đơn của kênh nào
// thì tính vào kênh đó, trả hàng theo đơn của kênh đó.
function buildReturnChannels(
  returns: ApiReturn[],
  orders: ApiOrder[],
  channels: ApiChannel[],
): ReturnChannelStat[] {
  const orderChannel = new Map(
    orders.map((order) => [order.id, order.channelId]),
  );
  return channels.map((channel) => {
    const orderCount = orders.filter(
      (order) => order.channelId === channel.id,
    ).length;
    const returnCount = returns.filter(
      (ret) => orderChannel.get(ret.orderId) === channel.id,
    ).length;
    return {
      channel: channel.name,
      returns: returnCount,
      orders: orderCount,
      percent:
        orderCount === 0 ? 0 : Math.round((returnCount / orderCount) * 100),
    };
  });
}

export default async function CskhPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/customer-care", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Chăm sóc khách hàng" />;
  }

  let returnChannels: ReturnChannelStat[] = [];
  let pendingReturns: number | null = null;
  let returnsError: ReturnsError | null = null;
  try {
    const [returns, orders, channels] = await Promise.all([
      fetchList<ApiReturn>("/returns"),
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiChannel>("/channels"),
    ]);
    returnChannels = buildReturnChannels(returns, orders, channels);
    pendingReturns = returns.filter(
      (ret) => ret.status === "Chờ xử lý",
    ).length;
  } catch (error) {
    // Panel hoàn hàng là dữ liệu phụ: lỗi tải thì chỉ báo lỗi ở panel,
    // phần yêu cầu hỗ trợ vẫn hiện bằng dữ liệu mẫu như trước.
    returnsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  return (
    <CskhClient
      returnChannels={returnChannels}
      pendingReturns={pendingReturns}
      returnsError={returnsError}
    />
  );
}

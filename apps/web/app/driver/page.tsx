// SPDX-License-Identifier: Apache-2.0
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import DriverClient from "./driver-client";
import type {
  ApiDriver,
  ApiOrderDetail,
  ApiShipment,
  ApiVehicle,
  DriverListView,
  DriverOrderCard,
} from "./driver-types";

// Gọi API, lỗi mạng thì trả null để trang quyết định hiện báo lỗi.
async function safeFetch(path: string): Promise<Response | null> {
  try {
    return await apiFetch(path);
  } catch {
    return null;
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await safeFetch(path);
  if (res === null || !res.ok) {
    return null;
  }
  return res.json().catch(() => null);
}

// Địa chỉ nối đủ cấp, thiếu thì "-".
function joinAddress(order: ApiOrderDetail): string {
  const parts = [
    order.address?.street,
    order.address?.ward,
    order.address?.district,
    order.address?.province,
  ].filter((part) => part !== undefined && part.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : "-";
}

export default async function DriverPage() {
  const session = await getSession();
  if (!session) {
    return <DriverClient view={{ kind: "login" }} />;
  }

  // Tài xế khớp theo username đăng nhập; API không lọc theo username nên
  // lấy toàn bộ rồi khớp ở phía web.
  const driversRaw = await fetchJson("/drivers");
  if (!Array.isArray(driversRaw)) {
    return (
      <DriverClient
        view={{ kind: "error", message: "Không tải được danh sách tài xế." }}
      />
    );
  }
  const drivers = driversRaw as ApiDriver[];
  const driver = drivers.find((item) => item.username === session.username);
  if (!driver) {
    return <DriverClient view={{ kind: "no-driver" }} />;
  }

  // Xe tài xế thường lái, lấy từ bản ghi driver; không gắn xe thì báo rõ.
  let vehicleLabel = "Chưa gắn xe";
  if (driver.vehicleId) {
    const vehicleRaw = await fetchJson(`/vehicles/${encodeURIComponent(driver.vehicleId)}`);
    if (vehicleRaw !== null && typeof vehicleRaw === "object") {
      const vehicle = vehicleRaw as ApiVehicle;
      vehicleLabel = `${vehicle.plate} (${vehicle.type})`;
    } else {
      vehicleLabel = driver.vehicleId;
    }
  }

  // Shipment của tài xế: API không lọc theo driverId nên lấy toàn bộ rồi
  // lọc ở phía web.
  const shipmentsRaw = await fetchJson("/shipments");
  if (!Array.isArray(shipmentsRaw)) {
    return (
      <DriverClient
        view={{ kind: "error", message: "Không tải được danh sách giao hàng." }}
      />
    );
  }
  const shipments = (shipmentsRaw as ApiShipment[]).filter(
    (shipment) => shipment.driverId === driver.id,
  );

  // Thông tin đơn cho từng shipment; đơn nào lỗi tải thì bỏ thẻ đó và báo
  // ghi chú, không lỗi cả danh sách.
  const settled = await Promise.allSettled(
    shipments.map(async (shipment) => {
      const orderRaw = await fetchJson(`/orders/${encodeURIComponent(shipment.orderId)}`);
      if (orderRaw === null || typeof orderRaw !== "object") {
        return null;
      }
      return { shipment, order: orderRaw as ApiOrderDetail };
    }),
  );
  let loadFailed = false;
  const cards: DriverOrderCard[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled" || result.value === null) {
      loadFailed = true;
      continue;
    }
    const { shipment, order } = result.value;
    cards.push({
      orderId: order.id,
      shipmentId: shipment.id,
      shipmentStatus: shipment.status,
      address: joinAddress(order),
      deadline: order.deadline,
      itemsText: order.items.map((item) => `${item.sku} x${item.quantity}`).join(", "),
      customer: order.customer,
      phone: order.phone,
      total: order.total,
    });
  }
  // Đơn giao sớm lên trước; đơn không có mốc giao hẹn xuống cuối.
  cards.sort((a, b) => {
    if (a.deadline === null && b.deadline === null) return 0;
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const view: DriverListView = {
    kind: "ok",
    driver,
    vehicleLabel,
    dateLabel: `Hôm nay, ${dateLabel}`,
    cards,
    loadNote: loadFailed
      ? "Không tải được thông tin một số đơn, thử tải lại trang."
      : null,
  };
  return <DriverClient view={view} />;
}

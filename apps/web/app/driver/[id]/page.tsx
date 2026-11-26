// SPDX-License-Identifier: Apache-2.0
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import DriverDetailClient from "./driver-detail-client";
import type {
  ApiDeliveryEvent,
  ApiDriver,
  ApiInventoryItem,
  ApiOrderDetail,
  ApiShipment,
  ApiVehicle,
  DriverDetailView,
} from "../driver-types";

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

// Shipment mới nhất của đơn, theo updatedAt.
function latestShipment(shipments: ApiShipment[]): ApiShipment | null {
  let latest: ApiShipment | null = null;
  for (const shipment of shipments) {
    if (!latest || shipment.updatedAt >= latest.updatedAt) {
      latest = shipment;
    }
  }
  return latest;
}

export default async function DriverDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/driver", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Tài xế" />;
  }

  // Tài xế khớp theo username đăng nhập; API không lọc theo username nên
  // lấy toàn bộ rồi khớp ở phía web.
  const driversRaw = await fetchJson("/drivers");
  if (!Array.isArray(driversRaw)) {
    return (
      <DriverDetailClient
        view={{ kind: "error", message: "Không tải được danh sách tài xế." }}
      />
    );
  }
  const driver = (driversRaw as ApiDriver[]).find(
    (item) => item.username === session.username,
  );
  if (!driver) {
    return <DriverDetailClient view={{ kind: "no-driver" }} />;
  }

  const orderRes = await safeFetch(`/orders/${encodeURIComponent(id)}`);
  if (orderRes === null || !orderRes.ok) {
    if (orderRes?.status === 404) {
      return <DriverDetailClient view={{ kind: "not-found", id }} />;
    }
    if (orderRes?.status === 401) {
      return <DriverDetailClient view={{ kind: "login" }} />;
    }
    return (
      <DriverDetailClient
        view={{
          kind: "error",
          message: orderRes ? `API trả về ${orderRes.status}.` : "Không gọi được API.",
        }}
      />
    );
  }
  const orderRaw: unknown = await orderRes.json().catch(() => null);
  if (orderRaw === null || typeof orderRaw !== "object") {
    return (
      <DriverDetailClient
        view={{ kind: "error", message: "API trả về dữ liệu không đúng dạng." }}
      />
    );
  }
  const order = orderRaw as ApiOrderDetail;

  // Shipment mới nhất của đơn + nhật ký giao hàng + tồn kho (tên, giá).
  // Danh sách phụ lỗi thì dùng rỗng, không lỗi cả trang chi tiết.
  const [shipmentsRaw, eventsRaw, productsRaw] = await Promise.all([
    fetchJson(`/shipments?orderId=${encodeURIComponent(id)}`),
    fetchJson(`/delivery-events?orderId=${encodeURIComponent(id)}`),
    fetchJson("/inventory"),
  ]);
  const shipments = (Array.isArray(shipmentsRaw) ? shipmentsRaw : []) as ApiShipment[];
  const events = (Array.isArray(eventsRaw) ? eventsRaw : []) as ApiDeliveryEvent[];
  const products = (Array.isArray(productsRaw) ? productsRaw : []) as ApiInventoryItem[];
  const shipment = latestShipment(shipments);

  // Chỉ tài xế được giao đơn này mới xem được nội dung đơn. Kiểm tra ở
  // server, không hiện nội dung đơn cho tài xế khác.
  if (shipment === null) {
    return <DriverDetailClient view={{ kind: "no-shipment", id }} />;
  }
  if (shipment.driverId !== driver.id) {
    return <DriverDetailClient view={{ kind: "not-own", id }} />;
  }

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

  const view: DriverDetailView = {
    kind: "ok",
    order,
    shipment,
    events,
    products,
    driver,
    vehicleLabel,
  };
  return <DriverDetailClient view={view} />;
}

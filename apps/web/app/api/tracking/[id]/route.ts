// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  ApiDeliveryEvent,
  ApiShipment,
  TrackingLookupResult,
} from "../../../tracking/tracking-types";
import type { ApiInventoryItem } from "../../../orders/orders-types";

// Tra cứu đơn: trình duyệt gọi route này, route gộp đơn + nhật ký giao
// hàng + shipment + tồn kho từ API với token trong cookie httpOnly; token
// không ra trình duyệt. Đơn 404 thì trả 404 để client hiện khung không tìm
// thấy; tài xế/xe không tải được thì trả tên/biển số null, không lỗi cả
// tra cứu.

// Lấy message từ lỗi NestJS ({message} là chuỗi hoặc mảng chuỗi).
async function apiErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    const message = (data as Record<string, unknown> | null)?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      const text = message.filter((item) => typeof item === "string").join("; ");
      if (text.length > 0) {
        return text;
      }
    }
  } catch {
    // Rơi xuống thông báo mặc định ở dưới.
  }
  return `API trả về ${response.status}.`;
}

// Đọc 1 trường chuỗi từ 1 bản ghi API, lỗi hay thiếu thì trả null.
async function fetchField(path: string, field: string): Promise<string | null> {
  try {
    const res = await apiFetch(path);
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const value = (data as Record<string, unknown> | null)?.[field];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function latestShipment(shipments: ApiShipment[]): ApiShipment | null {
  let latest: ApiShipment | null = null;
  for (const shipment of shipments) {
    if (!latest || shipment.updatedAt >= latest.updatedAt) {
      latest = shipment;
    }
  }
  return latest;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const id = params.id;
  let orderRes: Response;
  let eventsRes: Response;
  let shipmentsRes: Response;
  let inventoryRes: Response;
  try {
    [orderRes, eventsRes, shipmentsRes, inventoryRes] = await Promise.all([
      apiFetch(`/orders/${encodeURIComponent(id)}`),
      apiFetch(`/delivery-events?orderId=${encodeURIComponent(id)}`),
      apiFetch(`/shipments?orderId=${encodeURIComponent(id)}`),
      apiFetch("/inventory"),
    ]);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Không gọi được API." }, { status: 502 });
  }
  if (!orderRes.ok) {
    if (orderRes.status === 404) {
      return NextResponse.json({ message: "Không tìm thấy đơn hàng." }, { status: 404 });
    }
    return NextResponse.json(
      { message: await apiErrorMessage(orderRes) },
      { status: orderRes.status },
    );
  }
  const order: unknown = await orderRes.json().catch(() => null);
  const eventsRaw: unknown = eventsRes.ok ? await eventsRes.json().catch(() => null) : null;
  const shipmentsRaw: unknown = shipmentsRes.ok ? await shipmentsRes.json().catch(() => null) : null;
  const productsRaw: unknown = inventoryRes.ok ? await inventoryRes.json().catch(() => null) : null;
  if (order === null || typeof order !== "object") {
    return NextResponse.json(
      { message: "API trả về dữ liệu không đúng dạng." },
      { status: 502 },
    );
  }
  const events = (Array.isArray(eventsRaw) ? eventsRaw : []) as ApiDeliveryEvent[];
  const shipments = (Array.isArray(shipmentsRaw) ? shipmentsRaw : []) as ApiShipment[];
  const products = (Array.isArray(productsRaw) ? productsRaw : []) as ApiInventoryItem[];
  const shipment = latestShipment(shipments);
  const [driverName, vehiclePlate] = await Promise.all([
    shipment?.driverId
      ? fetchField(`/drivers/${encodeURIComponent(shipment.driverId)}`, "name")
      : Promise.resolve(null),
    shipment?.vehicleId
      ? fetchField(`/vehicles/${encodeURIComponent(shipment.vehicleId)}`, "plate")
      : Promise.resolve(null),
  ]);
  const payload: TrackingLookupResult = {
    order: order as TrackingLookupResult["order"],
    events,
    shipment,
    driverName,
    vehiclePlate,
    products,
  };
  return NextResponse.json(payload);
}

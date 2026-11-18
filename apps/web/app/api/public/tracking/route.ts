// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

// Chuyển tiếp tra cứu công khai sang API: khách không đăng nhập nên route
// này không dùng apiFetch (cần token trong cookie), mà gọi thẳng
// API_BASE_URL. Trả nguyên trạng thái và thân API trả về, kể cả 400/404
// với thông báo của API, để client hiện đúng thông báo đó.
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId") ?? "";
  const phone = searchParams.get("phone") ?? "";
  const url =
    `${API_BASE_URL}/public/tracking` +
    `?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    return NextResponse.json({ message: "Không gọi được API." }, { status: 502 });
  }
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

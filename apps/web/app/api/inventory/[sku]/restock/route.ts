// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Nhập thêm hàng vào kho: trình duyệt gọi route này, route chuyển tiếp
// sang API với token trong cookie httpOnly; token không ra trình duyệt.
// Vai trò và rào chắn do API kiểm tra, lỗi trả về kèm message của API.
export async function POST(
  request: Request,
  { params }: { params: { sku: string } },
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Dữ liệu gửi lên không phải JSON." }, { status: 400 });
  }
  let response: Response;
  try {
    response = await apiFetch(`/inventory/${encodeURIComponent(params.sku)}/restock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Không gọi được API." }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(response) },
      { status: response.status },
    );
  }
  return NextResponse.json(await response.json(), { status: response.status });
}

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

// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Chuyển tiếp thao tác archive sang API. Token nằm trong cookie httpOnly,
// route server lấy qua apiFetch.
export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => ({}));
  let response: Response;
  try {
    response = await apiFetch("/archive/orders/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Không gọi được API archive." },
      { status: 502 },
    );
  }
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

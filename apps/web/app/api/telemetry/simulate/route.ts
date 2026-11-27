// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Chuyển tiếp thao tác mô phỏng telemetry sang API. Token nằm trong cookie
// httpOnly, route server lấy qua apiFetch.
export async function POST(): Promise<NextResponse> {
  let response: Response;
  try {
    response = await apiFetch("/telemetry/simulate", { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Không gọi được API telemetry." },
      { status: 502 },
    );
  }
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

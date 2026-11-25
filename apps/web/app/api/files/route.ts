// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Chuyển tiếp multipart upload sang API. Trình duyệt không giữ token;
// route server lấy token từ cookie httpOnly qua apiFetch.
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Dữ liệu gửi lên không phải multipart/form-data." },
      { status: 400 },
    );
  }
  let response: Response;
  try {
    response = await apiFetch("/files", {
      method: "POST",
      body: form,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Không gọi được API." },
      { status: 502 },
    );
  }
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).search;
  let response: Response;
  try {
    response = await apiFetch(`/files${query}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Không gọi được API." },
      { status: 502 },
    );
  }
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Notification: route server chuyển tiếp sang API, token vẫn nằm trong cookie
// httpOnly. Vai và phạm vi notification do API quyết định.
export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).search;
  let response: Response;
  try {
    response = await apiFetch(`/notifications${query}`);
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
    // Rơi xuống thông báo mặc định.
  }
  return `API trả về ${response.status}.`;
}

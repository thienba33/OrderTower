// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).search;
  let response: Response;
  try {
    response = await apiFetch(`/automation/notifications${query}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Không gọi được API." }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { message: `API trả về ${response.status}.` },
      { status: response.status },
    );
  }
  return NextResponse.json(await response.json(), { status: response.status });
}

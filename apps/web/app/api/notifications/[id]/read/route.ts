// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params;
  let response: Response;
  try {
    response = await apiFetch(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    );
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

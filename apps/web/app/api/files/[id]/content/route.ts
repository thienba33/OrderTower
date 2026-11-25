// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";

// Tải nội dung file qua API. API kiểm tra quyền và trạng thái clean trước
// khi trả object từ SeaweedFS.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let response: Response;
  try {
    response = await apiFetch(
      `/files/${encodeURIComponent(params.id)}/content`,
    );
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
  if (!response.ok) {
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition":
        response.headers.get("content-disposition") ?? "inline",
    },
  });
}

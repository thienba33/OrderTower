// SPDX-License-Identifier: Apache-2.0
import 'server-only';

import { cookies } from 'next/headers';

// Client gọi API phía server. API không bật CORS nên trình duyệt không
// được gọi API trực tiếp; mọi lời gọi đều đi qua code server của Next.js,
// kèm token lấy từ cookie httpOnly.

const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:9080/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `API trả về ${status}.`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Gọi API với Bearer token trong cookie. Chưa đăng nhập thì ném ApiError
// 401 để nơi gọi tự quyết định chuyển hướng đăng nhập; helper này không
// tự chuyển hướng. Mặc định không cache; nơi gọi có thể ghi đè qua init.
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = (await cookies()).get('ot_access_token')?.value;
  if (!accessToken) {
    throw new ApiError(401, 'Chưa đăng nhập.');
  }
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers,
  });
}

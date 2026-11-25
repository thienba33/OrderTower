// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from 'next/server';

// Làm mới access token trước khi hết hạn để người dùng không phải đăng nhập
// lại. Middleware chạy trước cả trang và route API, nên token mới được ghi
// vào cookie và được chuyển tiếp cho request hiện tại.
//
// Access token Keycloak mặc định sống 5 phút; refresh token 30 ngày. Chỉ
// làm mới khi còn dưới 60 giây, tránh gọi token endpoint ở mọi request.

const ACCESS_TOKEN_COOKIE = 'ot_access_token';
const REFRESH_TOKEN_COOKIE = 'ot_refresh_token';
const ID_TOKEN_COOKIE = 'ot_id_token';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:9080';
const KEYCLOAK_INTERNAL_URL =
  process.env.KEYCLOAK_INTERNAL_URL ?? KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? 'ordertower';
const KEYCLOAK_CLIENT_ID =
  process.env.KEYCLOAK_CLIENT_ID ?? 'ordertower-web';

const REFRESH_WINDOW_SECONDS = 60;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 3600;

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  expires_in?: unknown;
}

interface RefreshedTokens {
  access_token: string;
  refresh_token: string;
  id_token: string | null;
  expiresIn: number;
}

function decodeExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const payload: unknown = JSON.parse(atob(padded));
    if (payload === null || typeof payload !== 'object') {
      return null;
    }
    const exp = (payload as Record<string, unknown>).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

function tokenUrl(): string {
  return `${KEYCLOAK_INTERNAL_URL.replace(/\/$/, '')}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
}

async function refreshTokens(
  refreshToken: string,
): Promise<RefreshedTokens | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: KEYCLOAK_CLIENT_ID,
    refresh_token: refreshToken,
  });
  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  let data: TokenResponse;
  try {
    data = (await response.json()) as TokenResponse;
  } catch {
    return null;
  }
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string'
  ) {
    return null;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: typeof data.id_token === 'string' ? data.id_token : null,
    expiresIn:
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? data.expires_in
        : 300,
  };
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.next();
  }
  const exp = accessToken ? decodeExp(accessToken) : null;
  const now = Math.floor(Date.now() / 1000);
  if (exp !== null && exp - now > REFRESH_WINDOW_SECONDS) {
    return NextResponse.next();
  }

  const refreshed = await refreshTokens(refreshToken);
  if (!refreshed) {
    // Refresh token hết hạn hoặc bị thu hồi: xóa phiên để trang đăng nhập
    // được hiển thị thay vì giữ cookie token cũ.
    const response = NextResponse.next();
    response.cookies.set(ACCESS_TOKEN_COOKIE, '', { ...cookieOptions(0) });
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', { ...cookieOptions(0) });
    response.cookies.set(ID_TOKEN_COOKIE, '', { ...cookieOptions(0) });
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  const nextCookies = new Map(
    request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
  );
  nextCookies.set(ACCESS_TOKEN_COOKIE, refreshed.access_token);
  nextCookies.set(REFRESH_TOKEN_COOKIE, refreshed.refresh_token);
  if (refreshed.id_token) {
    nextCookies.set(ID_TOKEN_COOKIE, refreshed.id_token);
  }
  requestHeaders.set(
    'cookie',
    Array.from(nextCookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
  );

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.cookies.set(
    ACCESS_TOKEN_COOKIE,
    refreshed.access_token,
    cookieOptions(refreshed.expiresIn),
  );
  response.cookies.set(
    REFRESH_TOKEN_COOKIE,
    refreshed.refresh_token,
    cookieOptions(REFRESH_TOKEN_MAX_AGE),
  );
  if (refreshed.id_token) {
    response.cookies.set(
      ID_TOKEN_COOKIE,
      refreshed.id_token,
      cookieOptions(refreshed.expiresIn),
    );
  }
  return response;
}

function cookieOptions(maxAge: number): {
  httpOnly: boolean;
  path: string;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    // Dev chạy HTTP nên Secure=false; production bật HTTPS phải đổi true.
    secure: false,
    maxAge,
  };
}

export const config = {
  // Bỏ qua tài nguyên tĩnh và các route đăng nhập/xuất để không làm mới
  // token trong lúc đang thiết lập hoặc xóa phiên.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|auth/callback|api/auth/login|api/auth/logout).*)',
  ],
};

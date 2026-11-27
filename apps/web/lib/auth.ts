// SPDX-License-Identifier: Apache-2.0
import 'server-only';

import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';

// Đăng nhập Keycloak chỉ chạy phía server. Token chỉ nằm trong cookie
// httpOnly, trình duyệt không bao giờ thấy token, và API không bật CORS
// nên trình duyệt cũng không được gọi API trực tiếp.

// Gốc của app web. Keycloak đã đăng ký redirect URI này; chạy production
// đặt APP_ORIGIN=https://... và đăng ký lại redirect URI trong realm.
export const APP_ORIGIN =
  process.env.APP_ORIGIN ?? 'http://localhost:3000';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:9080';
// URL nội bộ để server gọi Keycloak (đổi token, lấy discovery): trong
// Docker, localhost:9080 từ trong container web không tới được
// APISIX/Keycloak. Mặc định bằng KEYCLOAK_URL nên chạy dev ngoài Docker
// không đổi gì. Cách tách này giống KEYCLOAK_INTERNAL_URL của services/api.
const KEYCLOAK_INTERNAL_URL =
  process.env.KEYCLOAK_INTERNAL_URL ?? KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? 'ordertower';
const KEYCLOAK_CLIENT_ID =
  process.env.KEYCLOAK_CLIENT_ID ?? 'ordertower-web';

const ACCESS_TOKEN_COOKIE = 'ot_access_token';
const REFRESH_TOKEN_COOKIE = 'ot_refresh_token';
const ID_TOKEN_COOKIE = 'ot_id_token';
const STATE_COOKIE = 'ot_oauth_state';
const VERIFIER_COOKIE = 'ot_code_verifier';

// Cookie đăng nhập chạy qua HTTP ở môi trường dev nên mặc định Secure=false.
// Production chạy HTTPS thì PHẢI đặt COOKIE_SECURE=true.
const COOKIE_BASE = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
};

export interface Session {
  username: string;
  roles: string[];
}

// Bản đồ vai Keycloak sang vai nghiệp vụ, giống hệt
// services/api/src/auth/roles.ts. Vai nào không có trong bảng thì bỏ.
const KEYCLOAK_ROLE_TO_BUSINESS_ROLE: Record<string, string> = {
  admin: 'Quản trị viên',
  dispatcher: 'Điều phối viên',
  'warehouse-staff': 'Nhân viên kho',
  'customer-service': 'Nhân viên chăm sóc khách hàng',
  driver: 'Tài xế',
  manager: 'Quản lý',
  customer: 'Khách hàng mô phỏng',
};

function mapRoles(keycloakRoles: unknown): string[] {
  if (!Array.isArray(keycloakRoles)) {
    return [];
  }
  const mapped: string[] = [];
  for (const role of keycloakRoles) {
    const businessRole =
      typeof role === 'string'
        ? KEYCLOAK_ROLE_TO_BUSINESS_ROLE[role]
        : undefined;
    if (businessRole && !mapped.includes(businessRole)) {
      mapped.push(businessRole);
    }
  }
  return mapped;
}

function base64UrlEncode(data: Buffer): string {
  return data
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Giải mã payload của JWT mà KHÔNG kiểm chữ ký, chỉ để hiển thị tên
// người dùng và vai. Mọi quyết định bảo mật đều do API đưa ra, API tự
// kiểm chữ ký token qua JWKS của Keycloak.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);
    if (payload === null || typeof payload !== 'object') {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function keycloakUrl(path: string): string {
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}${path}`;
}

// URL Keycloak cho server gọi (đổi token, discovery). URL trình duyệt
// (đăng nhập, đăng xuất) vẫn dùng keycloakUrl ở trên.
function keycloakInternalUrl(path: string): string {
  return `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}${path}`;
}

// Xây URL đăng nhập Keycloak (Authorization Code + PKCE S256) và lưu
// state + code_verifier vào cookie tạm để đối chiếu ở callback.
export async function startLogin(): Promise<string> {
  const state = randomBytes(16).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = base64UrlEncode(
    createHash('sha256').update(codeVerifier).digest(),
  );
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, { ...COOKIE_BASE, maxAge: 600 });
  jar.set(VERIFIER_COOKIE, codeVerifier, { ...COOKIE_BASE, maxAge: 600 });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: `${APP_ORIGIN}/auth/callback`,
    scope: 'openid profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${keycloakUrl('/protocol/openid-connect/auth')}?${params}`;
}

export type CallbackResult = { ok: true } | { ok: false };

// Đổi code lấy token ở callback. State không khớp hoặc đổi code lỗi thì
// không lưu token nào và xóa cookie tạm.
export async function handleCallback(
  code: string,
  state: string,
): Promise<CallbackResult> {
  const jar = await cookies();
  const clearTemp = () => {
    jar.delete(STATE_COOKIE);
    jar.delete(VERIFIER_COOKIE);
  };
  const savedState = jar.get(STATE_COOKIE)?.value;
  const codeVerifier = jar.get(VERIFIER_COOKIE)?.value;
  if (!savedState || !codeVerifier || savedState !== state) {
    clearTemp();
    return { ok: false };
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KEYCLOAK_CLIENT_ID,
    code,
    redirect_uri: `${APP_ORIGIN}/auth/callback`,
    code_verifier: codeVerifier,
  });
  let response: Response;
  try {
    response = await fetch(keycloakInternalUrl('/protocol/openid-connect/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    clearTemp();
    return { ok: false };
  }
  if (!response.ok) {
    clearTemp();
    return { ok: false };
  }
  const data: unknown = await response.json();
  if (data === null || typeof data !== 'object') {
    clearTemp();
    return { ok: false };
  }
  const tokens = data as Record<string, unknown>;
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const idToken = tokens.id_token;
  const expiresIn =
    typeof tokens.expires_in === 'number' && tokens.expires_in > 0
      ? tokens.expires_in
      : 300;
  if (
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    typeof idToken !== 'string'
  ) {
    clearTemp();
    return { ok: false };
  }
  jar.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...COOKIE_BASE,
    maxAge: expiresIn,
  });
  jar.set(ID_TOKEN_COOKIE, idToken, { ...COOKIE_BASE, maxAge: expiresIn });
  jar.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...COOKIE_BASE,
    maxAge: 30 * 24 * 3600,
  });
  clearTemp();
  return { ok: true };
}

// Đọc phiên đăng nhập từ cookie. Trả null khi chưa đăng nhập.
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }
  const idToken = jar.get(ID_TOKEN_COOKIE)?.value;
  const idPayload = idToken ? decodeJwtPayload(idToken) : null;
  const accessPayload = decodeJwtPayload(accessToken);
  // Middleware làm mới token trước khi hết hạn; nếu vẫn còn token hết hạn
  // ở đây nghĩa là refresh thất bại, coi như chưa đăng nhập.
  const accessExp = accessPayload?.exp;
  if (
    typeof accessExp === 'number' &&
    accessExp * 1000 <= Date.now()
  ) {
    return null;
  }
  const username =
    (idPayload?.preferred_username as string | undefined) ??
    (idPayload?.sub as string | undefined) ??
    (accessPayload?.preferred_username as string | undefined) ??
    (accessPayload?.sub as string | undefined);
  if (!username) {
    return null;
  }
  // Vai đọc từ access token, dự phòng ID token: Keycloak 26 không còn
  // đưa resource_access / realm_access vào ID token nữa (chỉ access
  // token mới có, qua scope roles). Đọc vai từ ID token sẽ luôn ra
  // danh sách rỗng nên menu chỉ còn màn Theo dõi.
  const readRoles = (payload: Record<string, unknown> | null): string[] => {
    if (!payload) {
      return [];
    }
    const resourceAccess = payload.resource_access as
      | Record<string, { roles?: unknown } | undefined>
      | undefined;
    const clientAccess = resourceAccess?.[KEYCLOAK_CLIENT_ID];
    const realmAccess = payload.realm_access as
      | { roles?: unknown }
      | undefined;
    return [...mapRoles(clientAccess?.roles), ...mapRoles(realmAccess?.roles)];
  };
  const roles = Array.from(
    new Set([...readRoles(accessPayload), ...readRoles(idPayload)]),
  );
  return { username, roles };
}

// URL đăng xuất Keycloak (RP-initiated logout). Ưu tiên lấy
// end_session_endpoint từ discovery, lỗi thì tự ghép URL.
export async function logoutUrl(): Promise<string> {
  let endSession = keycloakUrl('/protocol/openid-connect/logout');
  try {
    const response = await fetch(
      keycloakInternalUrl('/.well-known/openid-configuration'),
    );
    if (response.ok) {
      const data: unknown = await response.json();
      const endpoint = (data as Record<string, unknown>)
        .end_session_endpoint;
      if (typeof endpoint === 'string' && endpoint.length > 0) {
        endSession = endpoint;
      }
    }
  } catch {
    // Dùng URL ghép sẵn ở trên.
  }
  // post_logout_redirect_uri phải khớp đúng từng ký tự với
  // post.logout.redirect.uris trong realm (hiện là
  // http://localhost:3000/ có dấu / cuối), thiếu dấu / là Keycloak
  // báo "Invalid redirect uri". new URL(...).href chuẩn hoá gốc
  // trần thành dạng có dấu / cuối.
  const params = new URLSearchParams({
    post_logout_redirect_uri: new URL(APP_ORIGIN).href,
  });
  const idToken = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  if (idToken) {
    params.set('id_token_hint', idToken);
  }
  return `${endSession}?${params}`;
}

// Xóa toàn bộ cookie token.
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_TOKEN_COOKIE);
  jar.delete(REFRESH_TOKEN_COOKIE);
  jar.delete(ID_TOKEN_COOKIE);
}

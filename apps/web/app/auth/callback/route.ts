// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/auth';

// Đây là redirect URI đã đăng ký trong Keycloak, không đổi đường dẫn.
// Keycloak trả về ?code=&state= sau khi người dùng đăng nhập xong.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const errorUrl = new URL('/?auth=error', request.url);
  if (!code || !state) {
    return NextResponse.redirect(errorUrl);
  }
  const result = await handleCallback(code, state);
  if (!result.ok) {
    return NextResponse.redirect(errorUrl);
  }
  const next = params.get('next');
  const target =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(target, request.url));
}

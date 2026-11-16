// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from 'next/server';
import { APP_ORIGIN, handleCallback } from '@/lib/auth';

// Đây là redirect URI đã đăng ký trong Keycloak, không đổi đường dẫn.
// Keycloak trả về ?code=&state= sau khi người dùng đăng nhập xong.
// Redirect về APP_ORIGIN, không dùng request.url làm gốc: server
// standalone chạy với HOSTNAME=0.0.0.0 nên request.url mang host
// 0.0.0.0, trình duyệt theo đó sẽ tới địa chỉ không mở được.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const errorUrl = new URL('/?auth=error', APP_ORIGIN);
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
  return NextResponse.redirect(new URL(target, APP_ORIGIN));
}

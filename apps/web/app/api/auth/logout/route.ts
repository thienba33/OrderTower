// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';
import { clearSession, logoutUrl } from '@/lib/auth';

// Đăng xuất: xóa cookie token rồi chuyển tới trang đăng xuất Keycloak.
export async function GET(): Promise<NextResponse> {
  const url = await logoutUrl();
  await clearSession();
  return NextResponse.redirect(url);
}

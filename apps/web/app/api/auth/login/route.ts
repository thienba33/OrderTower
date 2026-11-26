// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';
import { startLogin } from '@/lib/auth';

// Bắt đầu đăng nhập: chuyển hướng trình duyệt tới trang đăng nhập
// của Keycloak.
export async function GET(): Promise<NextResponse> {
  const url = await startLogin();
  return NextResponse.redirect(url);
}

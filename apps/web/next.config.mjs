// SPDX-License-Identifier: Apache-2.0
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bản build standalone cho Dockerfile: `next build` sinh thêm
  // .next/standalone/server.js để chạy production trong container.
  // Chạy dev (`npm run dev`) và `next start` ngoài Docker không đổi gì.
  output: 'standalone',
  // Header bảo mật cho toàn bộ ứng dụng web. API phía sau còn có header
  // riêng do APISIX gắn; hai lớp độc lập.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), camera=(), microphone=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

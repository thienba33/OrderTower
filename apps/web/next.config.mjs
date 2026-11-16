// SPDX-License-Identifier: Apache-2.0
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bản build standalone cho Dockerfile: `next build` sinh thêm
  // .next/standalone/server.js để chạy production trong container.
  // Chạy dev (`npm run dev`) và `next start` ngoài Docker không đổi gì.
  output: 'standalone',
};

export default nextConfig;

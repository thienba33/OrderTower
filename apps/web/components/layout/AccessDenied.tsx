// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";

// Trang báo khi tài khoản đã đăng nhập nhưng vai không được phép xem màn
// này. Hiện thẳng nội dung, không redirect vòng, không trả 404.
export function AccessDenied({
  roles,
  screenLabel,
}: {
  roles: readonly string[];
  screenLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">{screenLabel}</h1>
      <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        Bạn không có quyền xem màn này.{" "}
        {roles.length > 0 ? (
          <>Vai hiện tại của bạn: {roles.join(", ")}.{" "}</>
        ) : (
          <>Tài khoản của bạn chưa có vai nào được gán.{" "}</>
        )}
        <Link href="/" className="font-medium text-red-700 underline">
          Về trang chủ
        </Link>
        .
      </p>
    </div>
  );
}

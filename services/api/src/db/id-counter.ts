// SPDX-License-Identifier: Apache-2.0

// Tính số thứ tự tiếp theo cho mã DH-1001, WF-1001, AP-1001 từ các id đã
// có trong kho. Bộ đếm trong bộ nhớ chỉ là bộ đếm tạm: khi khởi động, service
// đọc các id đã lưu trong Postgres rồi đặt bộ đếm sau id lớn nhất, để mã mới
// không trùng mã cũ sau khi API khởi động lại. Chỉ 1 tiến trình API chạy nên
// cách này là đủ; nếu sau này chạy nhiều bản sao thì phải dùng sequence trong DB.
export function computeNextNumber(ids: string[], prefix: string): number {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 1000;
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) {
        max = n;
      }
    }
  }
  return max + 1;
}

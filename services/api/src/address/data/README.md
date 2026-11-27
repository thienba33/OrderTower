<!-- SPDX-License-Identifier: Apache-2.0 -->
# Dữ liệu địa chỉ (danh mục hành chính + bảng ánh xạ cũ -> mới)

## address-gazetteer.json

Danh mục hành chính sau sáp nhập 2025, nguồn chính thức duy nhất là
Quyết định 19/2025/QĐ-TTg (hiệu lực 01/07/2025) của Thủ tướng Chính phủ,
do Cục Thống kê (GSO), Bộ Tài chính quản lý mã số. Cả nước còn 34
tỉnh/thành và 3.321 xã/phường, KHÔNG còn cấp quận/huyện.

Định dạng: `{ note, provinces: [{ name, code, wards: [{ name, code }] }] }`.
Tên giữ nguyên như công bố ("Thành phố Hà Nội", "Phường Cửa Nam"); hàm
chuẩn hóa khi so khớp sẽ bỏ tiền tố tỉnh/thành phố và bỏ dấu.

Lưu ý về mã số: mã phường Cửa Nam (Hà Nội) trong tệp này là 82, theo
Phụ lục II Quyết định 19/2025/QĐ-TTg. Một số gói dữ liệu trung gian ghi
sai mã này thành 73; đối chiếu với Quyết định và bảng đối chiếu cũ -> mới
thì mã đúng là 82.

## address-legacy-map.json

Bảng ánh xạ phường/xã CŨ -> MỚI sau sáp nhập 01/07/2025 cho Hà Nội, Hải
Phòng, Quảng Ninh (3 tỉnh/thành mà dữ liệu mẫu OrderTower đang dùng).
Nguồn: các Nghị quyết sắp xếp đơn vị hành chính cấp xã (ví dụ Hà Nội: NQ
1656/NQ-UBTVQH15) + Cục Thống kê (GSO), qua bảng đối chiếu công khai.
Chỉ dùng để đối chiếu địa chỉ cũ sang địa chỉ mới; danh mục chuẩn vẫn là
`address-gazetteer.json` ở trên.

Định dạng: `{ note, mappings: [{ oldWard, oldDistrict, oldProvince,
newWard, newProvince, newWardCode, form }] }`. `form` là hình thức sáp
nhập của phường cũ: `toan-bo` = hợp nhất toàn bộ về 1 phường mới;
`chu-yeu` = tách, phần chủ yếu về phường mới này; `mot-phan` = tách, chỉ
một phần về phường mới này. Khi 1 phường cũ tách thành nhiều phường mới,
AI đề xuất phường nhận phần chủ yếu và ghi rõ "cần xác minh thêm".

Văn bản hành chính của cơ quan nhà nước không thuộc đối tượng bảo hộ
quyền tác giả (Luật Sở hữu trí tuệ, Điều 15).

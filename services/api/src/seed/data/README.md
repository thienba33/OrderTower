<!-- SPDX-License-Identifier: Apache-2.0 -->
# Dữ liệu mẫu mốc 3: kho 40 SKU và 112 đơn lịch sử

Snapshot đóng băng ngày 23/11/2026 cho tiêu chí S13 (mục 5 bản dự thảo
BI pilot). Sinh bởi `scripts/generate-sample-data.mjs` (seed xác định
20261123, chạy 2 lần ra cùng 1 kết quả), nạp lúc API khởi động sau 8 đơn
demo, qua đường dịch vụ thật. Không sửa tay 2 tệp JSON này: muốn đổi dữ
liệu thì sửa script rồi chạy lại và commit cả script lẫn snapshot.

## Tổng số sau khi nạp seed

- Kho: 40 SKU (11 gốc + 29 mới). Đơn: 120 (8 demo DH-1001..DH-1008 +
  112 lịch sử LS-1001..LS-1112). Đơn tạo tay đầu tiên sau seed vẫn là
  DH-1009 vì đơn lịch sử dùng mã LS- riêng.
- Phân bố 9 trạng thái của 112 đơn lịch sử: Hoàn 63, Đã giao 8, Đang
  giao 5, Chờ điều xe 8, Đang đóng gói 8, Chờ kho 8, Đã kiểm tra 5,
  Mới tạo 4, Hủy 3.
- Kênh: Chat (K-1001) 37 đơn, Web (K-1002) 44 đơn, Điện thoại (K-1003)
  31 đơn. Tổng 173 dòng hàng, 260 đơn vị sản phẩm; 61 đơn có 2 dòng.
- Trả hàng: 13 đơn (Chat 9, Web 3, Điện thoại 1), kết quả 5 đã hoàn
  tiền, 3 đã duyệt, 3 chờ xử lý, 2 đã từ chối. Trả hàng chờ xử lý gắn
  cho đơn còn ở Đã giao; trả hàng đã duyệt/hoàn tiền/từ chối gắn cho
  đơn đã đóng (Hoàn).
- Ngày tạo đơn: 27/10/2026 tới 22/11/2026. Mọi bước của luồng đều nằm
  trong cửa sổ 28 ngày, không bước nào vượt quá 23/11/2026 00:00 UTC.
  Ngày tham chiếu của bộ dữ liệu là 22/11/2026: cửa sổ 7 ngày của lớp
  BI phải neo vào ngày dữ liệu mới nhất, không neo vào ngày hiện tại,
  vì dữ liệu mẫu đã đóng băng.

## Cách đơn lịch sử đi qua luồng

Mỗi đơn tạo bằng `OrdersService.create` với `createdAt` lùi xác định
rồi chuyển trạng thái hợp lệ theo bảng lệch giờ sau thời điểm tạo đơn:
Đã kiểm tra +1 giờ, Chờ kho +3 giờ, Đang đóng gói +5 giờ, Chờ điều xe
+7 giờ, tạo shipment +7,5 giờ, điều xe +26 giờ, giao hàng +31 giờ,
đóng đơn +33 giờ. Đơn giao thất bại 1 lần: báo thất bại +30 giờ rồi
quay lại Chờ điều xe (2 đơn). Đơn hoàn: tạo trả hàng +49 giờ, quyết
định +52 giờ, hoàn tiền +56 giờ (nếu có), đóng đơn +54 giờ (đã duyệt
hoặc đã từ chối) hoặc +58 giờ (đã hoàn tiền). Đơn hủy: hủy từ Mới tạo
+2 giờ (1 đơn) hoặc từ Đã kiểm tra +4 giờ (2 đơn). Đơn đích là Đang
giao được nạp sau cùng để không giữ hết tài xế trước khi các đơn đã
giao xong kịp điều xe, nên mã LS- theo thứ tự nạp chứ không theo đúng
thứ tự dòng trong tệp.

Điều xe chọn cặp tài xế và xe còn sẵn sàng đầu tiên (5 tài xế
TX-1001..TX-1005 và 5 xe XE-1001..XE-1005) nên không giữ trùng tài xế
hay xe; giao hàng hoặc giao thất bại trả cặp đó về sẵn sàng, 5 đơn còn
ở Đang giao giữ 5 cặp tới cuối. Ảnh bằng chứng giao hàng theo mẫu
`chung-tu/LS-1001/anh-giao.jpg`. Audit ghi đủ mọi bước với cùng thời
điểm lùi nên chuỗi băm vẫn kiểm tra được.

## Tồn kho: stock trong tệp là tồn kho đầu kỳ

`inventory.seed.json` ghi tồn kho ĐẦU KỲ (trước khi nạp đơn mẫu). Tồn
kho khả dụng sau khi nạp seed = stock - tổng lượng đã giữ cho đơn mẫu
(112 đơn lịch sử + 8 đơn demo, chỉ đơn qua đóng gói trở đi mới giữ
hàng). 11 SKU gốc giữ nguyên tồn kho khả dụng như dữ liệu đóng băng
02/11/2026: NM-25 486, NM-40 452, HS-KHO 304, NM-15 398, MT-08 87,
CK-03 324, NM-30 251, NM-45 91, MT-12 93, HS-MUC 89, CK-07 106.
NM-40 không xuất hiện trong bất kỳ đơn nào nên tồn kho giữ nguyên 452.

29 SKU mới đều có giá tham khảo thị trường (đồng) để lớp BI tính được
doanh thu: NM-10 45000, NM-20 78000, NM-35 118000, NM-50 168000,
NM-60 195000, NM-1L 165000, NM-5L 720000, NM-CA 135000, NM-RUOC 58000,
NM-NEM 42000, HS-TOM 245000, HS-MUC-500 320000, HS-CA-1KG 210000,
HS-CA-THU 185000, HS-BACH 275000, HS-SO 165000, HS-HAU 195000,
HS-RONG 85000, MT-1K 120000, CK-12 95000, DT-OP 89000, DT-CL 59000,
DT-SAC 189000, DT-CAP 79000, DT-TAI 149000, DT-PIN 349000, DT-LOA
259000, DT-GAY 129000, DT-CHU 199000. 7 SKU gốc chưa có giá (MT-08,
CK-03, NM-30, NM-45, MT-12, HS-MUC, CK-07) vẫn giữ giá null, không tự
đặt giá cho chúng.

## Tiền điều kiện cho lớp BI (mục 3 bản dự thảo)

- Tồn kho sắp hết (số ngày còn lại dưới 7 ngày và có đơn bán trong 7
  ngày gần nhất): NM-10 (1 đơn vị, 3,5 ngày), NM-20 (2 đơn vị, 3,5
  ngày), NM-35 (5 đơn vị, 2,1 ngày), NM-50 (1 đơn vị, 3,5 ngày),
  NM-CA (2 đơn vị, 4,7 ngày), NM-RUOC (1 đơn vị, 3,5 ngày), HS-MUC-500
  (2 đơn vị, 4,7 ngày).
- Tỷ lệ hoàn cao bất thường theo kênh: Chat 45,0% (9/20 đơn đã giao)
  vượt tỷ lệ chung 18,3% (13/71) tới 26,7 điểm phần trăm, kênh có 9 đơn
  hoàn; Web 11,5%, Điện thoại 4,0%.
- Cầu tăng đột biến: NM-35 bán 17 đơn vị trong 7 ngày cuối, gấp 2,4
  lần mốc 7 đơn vị của 7 ngày trước đó (mốc tối thiểu 5 đơn vị).

## Nâng cấp DB cũ và chạy lại

Seed lịch sử chỉ chạy khi chưa có đơn LS- nào trong DB. Trên DB đã có
dữ liệu từ trước mốc 3, kho chỉ có 11 SKU gốc nên service bỏ qua seed
lịch sử kèm cảnh báo trong log, API vẫn chạy bình thường với 8 đơn demo.
Muốn có đủ dữ liệu mốc 3 thì xóa DB rồi chạy lại (`docker compose down
-v` rồi up). Kiểm tra: tổng số đơn sau khi nạp là 120, audit
`verify()` vẫn hợp lệ.

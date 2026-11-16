<!-- SPDX-License-Identifier: Apache-2.0 -->
# Kịch bản demo Mốc 2 (15 phút)

Demo trên máy Sơn, cho Mốc 2 ngày Thứ Năm 19/11/2026. Kịch bản này dựa
trên mục 10 của plan, nhưng CHỈ ghi những gì demo được hôm nay. Đoạn
nào chưa demo được ghi rõ **CHƯA DEMO ĐƯỢC** kèm lý do. Không trình bày
phần chưa có như thể đã xong.

## Điều kiện tiên quyết

- Docker Desktop đang chạy trên máy Sơn.
- File `.env` đã tạo từ `.env.example` và điền đủ biến bắt buộc
  (`DATABASE_URL`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_USERNAME`,
  `KEYCLOAK_ADMIN_PASSWORD`, `ORDERTOWER_DEMO_PASSWORD`).
- Repo ở nhánh `dev`, đã pull mới nhất.
- Trình duyệt Chrome, cửa sổ 1440px.

> **CỜ ĐỎ: `apps/web` chưa có Dockerfile nên `docker compose up`
> toàn bộ sẽ gãy ở bước build web.** Sơn phải làm Dockerfile cho web
> trước, hoặc chạy web riêng bằng `npm run dev` như mục khởi động
> dưới đây. Đây là phần của Sơn, chưa làm.

> **Dữ liệu mẫu chưa đầy đủ:** kho (11 SKU) và kênh (Chat, Web, Điện
> thoại) tự nạp khi API khởi động. Đơn hàng, xe, tài xế, shipment
> KHÔNG tự nạp, cơ sở dữ liệu bắt đầu trống với các thực thể này.
> `seeds/sample-orders.json` chỉ có 2 đơn minh họa, không có lệnh nào
> nạp nó. Vì vậy trước giờ demo phải tạo 1 xe và 1 tài xế bằng API
> (mục chuẩn bị), còn đơn hàng thì tạo trực tiếp trong lúc demo.

## Khởi động

Chạy trong thư mục gốc của repo:

```bash
cp .env.example .env
# Điền các biến bắt buộc trong .env rồi chạy:
docker compose up -d postgres keycloak apisix seaweedfs api
```

Keycloak lần đầu cần 60-90 giây mới sẵn sàng. Kiểm tra từng dịch vụ:

```bash
curl http://localhost:3001/api/health
# Trả về 200 là API chạy.

curl http://localhost:9080/api/health
# Trả về 200 là APISIX tới được API.
```

Chạy web riêng (vì chưa có Dockerfile):

```bash
cd apps/web
npm install
npm run dev
# Mở http://localhost:3000
```

Tài khoản demo Keycloak (mật khẩu là `ORDERTOWER_DEMO_PASSWORD`
trong `.env`): `demo.dispatcher` (Điều phối viên),
`demo.warehouse-staff` (Nhân viên kho), `demo.driver` (Tài xế),
`demo.manager` (Quản lý), `demo.admin` (Quản trị viên),
`demo.customer-service` (Nhân viên chăm sóc khách hàng).

## Chuẩn bị dữ liệu trước giờ demo

Lấy token của `demo.admin` rồi tạo 1 xe và 1 tài xế (tên đăng nhập
của tài xế phải là `demo.driver` thì màn Tài xế mới nhận ra tài xế
đang đăng nhập):

```bash
# Lấy token (đổi mật khẩu demo cho đúng .env của Sơn):
TOKEN=$(curl -s -X POST http://localhost:9080/realms/ordertower/protocol/openid-connect/token \
  -d "grant_type=password&client_id=ordertower-web&username=demo.admin&password=<MAT_KHAU_DEMO>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:9080/api/vehicles \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plate": "29H-12345", "model": "Xe tải nhỏ"}'

curl -s -X POST http://localhost:9080/api/drivers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "Tài xế demo", "phone": "0901234567", "username": "demo.driver"}'
```

Ghi lại mã xe (`XE-...`) và mã tài xế (`TX-...`) trả về, dùng ở
phút 6-10.

## Trình tự demo theo phút

### Phút 0-2: giới thiệu

- Bài toán: hộ kinh doanh nước mắm và hải sản thủ công, 1 luồng đơn
  duy nhất, dashboard đọc dữ liệu thật.
- Tầng 1: Keycloak, APISIX, Postgres, Workflow engine tự viết trong
  NestJS. Tầng 2: chỉ 1 ứng dụng OrderTower.
- Nói rõ phần nào là ý tưởng tham khảo và phần nào là công việc gốc
  của đội. Nói trước: lớp BI, DX-Score và tính năng AI chưa có ở
  Mốc 2, sẽ nói ở phút 13-15.

### Phút 2-6: đơn mới vào, rào chắn chặn

1. Đăng nhập bằng `demo.dispatcher`. Mở màn Danh sách đơn, bấm tạo
   đơn: khách hàng, địa chỉ thiếu phường/xã (độ tin cậy dưới 70),
   mặt hàng NM-25 số lượng 600 (vượt tồn khả dụng 488, để lát nữa
   thử rào chắn tồn kho).
2. Gửi lại cùng đơn với cùng mã idempotency: hệ thống từ chối vì
   trùng đơn. Đây là rào chắn 1.
3. Mở chi tiết đơn: địa chỉ hiện mức tin cậy thấp. Sửa địa chỉ đủ
   tỉnh, quận/huyện, phường/xã, địa chỉ chi tiết rồi lưu, độ tin cậy
   tính lại trên 70.
4. Chuyển đơn qua Đã kiểm tra tới Chờ kho, rồi thử chuyển sang Đang
   đóng gói: hệ thống từ chối vì tồn kho không đủ (600 vượt 488 còn
   dùng được). Đây là rào chắn 2.
5. Sửa số lượng xuống 2 (đơn ở Chờ kho vẫn sửa được mặt hàng), rồi
   chuyển đơn qua Đang đóng gói tới Chờ điều xe.

### Phút 6-10: kho, điều xe, tài xế, dashboard

1. Đăng xuất, đăng nhập bằng `demo.warehouse-staff`. Mở màn Kho:
   số tồn NM-25 đã trừ phần giữ chỗ của đơn vừa tạo.
2. Chuyển đơn tới Chờ điều xe.
3. Đăng nhập lại bằng `demo.dispatcher`. Trên trang chi tiết đơn,
   tạo shipment rồi điều xe: chọn xe và tài xế đã tạo ở mục chuẩn bị.
   Thử điều xe lần 2 cho cùng đơn: hệ thống từ chối vì mỗi đơn tối
   đa 1 shipment đang mở.
4. Đăng nhập bằng `demo.driver`. Mở màn Tài xế: thấy shipment của
   chính mình, bấm giao hàng, nhập mã khóa ảnh bằng chứng.
5. Mở màn Tổng quan bằng `demo.dispatcher`: KPI, luồng 9 trạng thái
   và bảng SLA đã cập nhật theo đơn vừa đi qua luồng.
6. **CHƯA DEMO ĐƯỢC: AI cảnh báo nguy cơ trễ.** Không có tính năng
   AI nào đang chạy, không có endpoint cảnh báo. Bỏ đoạn này, đừng
   trình bày số liệu cảnh báo tự nghĩ ra.

### Phút 10-13: sự cố, chuyển trái phép, audit

1. Tạo thêm 1 đơn, đưa tới Đang giao, rồi báo giao thất bại kèm lý
   do: đơn quay lại Chờ điều xe theo đúng luồng. Đây là ngoại lệ
   theo luồng, không phải làm theo trí nhớ.
2. Thử 1 chuyển trạng thái trái phép (ví dụ từ Mới tạo nhảy thẳng
   tới Đã giao): hệ thống từ chối kèm lý do, audit ghi
   `order.transition.denied`.
3. Lấy đơn đã giao ở phút 6-10, thử đóng sang Hoàn mà không nhập
   hướng xử lý: hệ thống chặn vì thiếu hướng xử lý; nhập hướng xử
   lý rồi đóng được. Đây là rào chắn đóng đơn.
4. Đăng nhập bằng `demo.admin`. Mở màn Quản trị: bảng audit hiện
   đầy đủ các bản ghi vừa tạo, hash đủ 64 ký tự; dòng xác minh chuỗi
   hash báo hợp lệ và số bản ghi đã kiểm tra.
5. **CHƯA DEMO ĐƯỢC: quản lý xem lớp BI với 1 bất thường tồn kho sắp
   hết, 1 kênh có tỷ lệ hoàn cao và duyệt 1 đề xuất kèm giải thích.**
   Không có mô-đun BI nào trong API, không có endpoint dự báo hay
   bất thường, màn BI và DX-Score vẫn là dữ liệu mẫu. Bỏ đoạn này.

### Phút 13-15: câu chuyện H và kết

1. Kể câu chuyện H bằng bốn chỉ số ở mục 7 của plan (tỷ lệ bước làm
   tay, thời gian chờ duyệt trung bình, số quyết định mỗi người mỗi
   ngày, tỷ lệ ngoại lệ), bấm xuống log gốc trong bảng audit.
2. **CHƯA DEMO ĐƯỢC: radar DX-Score là cao trào của demo, đặt cạnh
   trước và sau trên cùng dữ liệu mẫu, tính lại 2 lần ra cùng 1 số.**
   Công thức DX-Score chưa đóng băng, chưa có mã tính điểm, chưa có
   ảnh chụp trước và sau. Thay bằng: nói thẳng DX-Score chưa đo, đây
   là việc của Mốc 3.
3. Tóm tắt chỉ số đã đo bằng bộ kiểm tra: 224 test API (17 suite)
   đều qua; typecheck, build và lint của web đều sạch; 12 màn đã nối
   API thật.
4. Nói rõ giới hạn đã biết: chưa kiểm chứng trên Postgres thật, chưa
   có Dockerfile cho web, lưu nhiều thực thể chưa phải 1 giao dịch
   chung, 5 màn còn phần chưa nối.

## Checklist kiểm chứng dữ liệu thật (12 màn đã nối)

Làm trước giờ demo, trên máy Sơn, với đăng nhập thật. Đánh dấu từng
mục khi đã thấy số liệu trên màn hình khớp với API.

- [ ] Đăng nhập `demo.dispatcher`: thấy tên thật và vai Điều phối viên trên header.
- [ ] Đăng nhập `demo.warehouse-staff`: vai Nhân viên kho, vào được màn Kho.
- [ ] Màn Danh sách đơn: số đơn khớp `GET /api/orders`; tạo đơn mới hiện ngay trong danh sách.
- [ ] Màn Chi tiết đơn: chuyển trạng thái thật, audit ghi đúng người thực hiện.
- [ ] Màn Giao hàng: tạo shipment, điều xe, giao hàng, báo thất bại đều đổi trạng thái đơn thật.
- [ ] Màn Hàng đợi duyệt: duyệt và từ chối phê duyệt thật, người xin không tự duyệt được.
- [ ] Màn Theo dõi đơn hàng: tra cứu đơn thật, timeline khớp lịch sử đơn.
- [ ] Màn Tài xế: đăng nhập `demo.driver` chỉ thấy shipment của chính mình.
- [ ] Màn Tổng quan: KPI và bảng SLA khớp số đơn thật trong API.
- [ ] Màn Kho: số tồn khớp `GET /api/inventory`, đã trừ phần giữ chỗ.
- [ ] Màn Phân tách địa chỉ: sửa địa chỉ tính lại độ tin cậy, số mới khớp API.
- [ ] Màn Quản trị: bảng audit khớp `GET /api/audit`, dòng verify báo hợp lệ.
- [ ] Màn Telesale: tab đơn ưu tiên chỉ hiện đơn sắp hết hạn hoặc tin cậy thấp, ETA tính từ giờ hiện tại.

## Nếu gãy giữa demo

- Web trắng hoặc lỗi 500: kiểm tra web có đang chạy ở cổng 3000
  không (`npm run dev` còn chạy không), rồi tải lại trang.
- API trả 401 trên mọi màn: token hết hạn, đăng xuất rồi đăng nhập
  lại. Keycloak lần đầu cần 60-90 giây, đừng demo ngay sau khi
  `docker compose up`.
- `docker compose up` gãy ở bước build web: xem mục CỜ ĐỎ ở đầu
  file, chạy web riêng bằng `npm run dev`.
- Màn hình trống không có đơn: cơ sở dữ liệu bắt đầu trống với đơn
  hàng, xe và tài xế; tạo lại theo mục chuẩn bị rồi tạo đơn mới
  trong lúc demo.

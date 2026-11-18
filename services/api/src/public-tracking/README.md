<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun public-tracking

Tra cứu đơn cho khách vãng lai: khách xem tiến trình đơn của mình mà
không cần tài khoản. Đây là endpoint công khai duy nhất ngoài
`GET /api/health`.

## Endpoint

`GET /api/public/tracking?orderId=DH-1001&phone=0901234567`

- `orderId` và `phone` đều bắt buộc, thiếu hoặc rỗng thì 400 với thông
  báo rõ ràng.
- Đơn không tồn tại, sai SĐT, hoặc đơn không có SĐT đều trả 404 với
  chung 1 thông báo "Không tìm thấy đơn hàng": mã đơn dạng DH-1001...
  là số thứ tự nên không được để lộ đơn nào có thật qua thông báo lỗi
  khác nhau, cũng không được để ai dò đơn bằng cách thử SĐT.
- SĐT so khớp đúng chuỗi sau khi cắt khoảng trắng 2 đầu (SĐT của đơn
  đã cắt lúc tạo, trống thì về null).

## Trả về

```json
{
  "order": {
    "id": "DH-1001",
    "state": "Đã giao",
    "items": [
      { "sku": "NM-25", "quantity": 2, "name": "Nước mắm 25 độ 500ml", "unitPrice": 93000 }
    ],
    "total": 186000,
    "deadline": "2026-11-20T10:00:00.000Z",
    "createdAt": "2026-11-18T01:00:00.000Z",
    "channelId": "K-1001",
    "address": {
      "street": "12 Ngõ 34 Đường Lê Lợi",
      "ward": "Phường Hàng Bài",
      "district": "Quận Hoàn Kiếm",
      "province": "Hà Nội"
    }
  },
  "timeline": [
    { "state": "Mới tạo", "at": "2026-11-18T01:00:00.000Z" },
    { "state": "Đã kiểm tra", "at": "2026-11-18T02:00:00.000Z" }
  ],
  "shipment": {
    "id": "GH-1001",
    "state": "Đã giao",
    "driverName": "Nam",
    "vehiclePlate": "29A-12345"
  },
  "deliveryEvents": [
    { "type": "Nhận đơn", "note": null, "createdAt": "2026-11-18T03:00:00.000Z" }
  ],
  "proofPhotoKey": "proof/dh-1001.jpg"
}
```

- `order.address` là địa chỉ giao hàng nguyên các phần như đơn đã lưu
  (`street`, `ward`, `district`, `province`), đúng dạng màn Theo dõi
  của web nối lại thành chuỗi; null khi đơn không ghi địa chỉ. Có địa
  chỉ trong trả về vì khách đã chứng minh là chủ đơn bằng SĐT, để màn
  khách xem đủ như bản đăng nhập.
- Mỗi dòng hàng có thêm `name` và `unitPrice` tra từ kho theo SKU, null
  khi SKU không có trong kho hoặc chưa có giá (không tự đặt tên hay tự
  đặt giá); màn khách tính thành tiền từng dòng bằng
  `unitPrice * quantity`, giống màn đăng nhập, hiện "-" khi đơn giá null.
- `timeline` là lịch sử trạng thái của đơn (mốc tạo + từng lần chuyển),
  xếp theo thời điểm. Lịch sử lấy từ trường `history` đã lưu trên đơn,
  cùng các lần chuyển mà audit log ghi lại (`order.created` và
  `workflow.instance.transition`); đọc từ đơn rẻ hơn quét toàn bộ bảng
  audit và không lộ hash chuỗi.
- `shipment` là shipment mới nhất của đơn (sửa đổi gần đây nhất), null
  khi đơn chưa có shipment nào. `driverName` và `vehiclePlate` tra sẵn
  từ tài xế/xe, null khi chưa điều xe hoặc tài xế/xe không còn trong kho.
- `deliveryEvents` là mọi sự kiện giao hàng của đơn, xếp theo thời
  điểm tạo, chỉ loại, ghi chú và thời điểm.
- `proofPhotoKey` là khóa tệp bằng chứng của shipment mới nhất, null
  khi chưa giao.

## Không trả ra ngoài

SĐT, tên khách, mã khách, khóa idempotency, id workflow, hash audit,
mức tin cậy và mức phân loại địa chỉ, tên người chuyển đơn, lý do và
hướng xử lý trong lịch sử, tên người ghi sự kiện và vai của họ, thông
tin phân đơn.

## Hạn chế đã biết

- Chỉ đọc qua service khác, không ghi gì: không có kho riêng, không có
  migration, không ghi audit (tra cứu không phải hành động nghiệp vụ).
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  kiểm thử đơn vị và kiểm tra metadata `@Public()` + guard (xem spec);
  giống mức kiểm chứng của các mô-đun API trước.

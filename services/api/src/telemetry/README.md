<!-- SPDX-License-Identifier: Apache-2.0 -->
# Telemetry và digital twin

Module IT/OT tối thiểu: đưa dữ liệu cảm biến của xe vào cùng hệ thống với dữ
liệu đơn hàng, rồi tính trạng thái twin từ reading mới nhất.

## Endpoint

| Endpoint | Quyền | Mô tả |
|---|---|---|
| `POST /api/telemetry/readings` | device key (`x-device-key`) | Thiết bị gửi reading |
| `GET /api/telemetry/readings?vehicleId=&limit=` | vai nội bộ | Lịch sử reading |
| `POST /api/telemetry/simulate` | Quản trị/Quản lý/Điều phối | Tạo dữ liệu mô phỏng cho demo |
| `GET /api/twins/vehicles` | vai nội bộ | Twin của tất cả xe |
| `GET /api/twins/vehicles/:id` | vai nội bộ | Twin của một xe |
| `GET /api/ngsi-ld/v1/entities?type=Vehicle` | vai nội bộ | Entity NGSI-LD tối giản |

## Trạng thái twin

- `online`: reading mới nhất trong `TELEMETRY_ONLINE_SECONDS` (mặc định 300s).
- `stale`: trong `TELEMETRY_STALE_SECONDS` (mặc định 1800s).
- `offline`: cũ hơn hoặc chưa có reading.

## Gắn tài xế thật

Mỗi twin trả thêm `driver`:

- Nếu xe đang có chuyến `Đang giao` hoặc `Giao thất bại`: lấy tài xế của
  shipment mới nhất; `source = "shipment"`, kèm `shipmentId`/`orderId`.
- Nếu không có chuyến: lấy tài xế đang gán thường lái qua
  `Driver.vehicleId`; `source = "assignment"`.
- Không có cả hai: `driver = null` (UI hiện “Chưa gán”).

NGSI-LD entity có thêm `driverId`, `driverName`, `driverPhone`,
`driverSource` khi có tài xế.

## Device key

`POST /api/telemetry/readings` là endpoint `@Public` ở tầng JWT nhưng bắt buộc
header `x-device-key` khớp `TELEMETRY_DEVICE_KEY`. Đây là mức tối thiểu cho
demo; production cần mTLS/HMAC, key rotation và rate limit riêng cho thiết bị.

Ví dụ:

```bash
curl -X POST http://localhost:9080/api/telemetry/readings \
  -H 'content-type: application/json' \
  -H 'x-device-key: dev-device-key' \
  -d '{"deviceId":"IOT-XE-1001","vehicleId":"XE-1001","lat":21.0278,"lng":105.8342,"temperatureC":3.5,"batteryPct":88}'
```

## Giới hạn đã biết

- Bản này là twin-lite: chỉ lưu reading, không mô phỏng toàn bộ vật lý xe.
- NGSI-LD chỉ là biểu diễn JSON-LD tối giản, chưa phải Orion Context Broker.
- Chưa có bản đồ nhúng; UI hiển thị toạ độ và link OpenStreetMap.
- Dữ liệu mô phỏng phải được ghi rõ là mô phỏng, không dùng như số liệu thật.

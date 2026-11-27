// SPDX-License-Identifier: Apache-2.0
# Lớp BI pilot và DX-Score v1

Lớp BI (Business Intelligence) pilot của OrderTower: dự báo nhu cầu, phát
hiện bất thường, đề xuất hành động kèm đầu vào rõ ràng, duyệt tay, và tính
DX-Score v1 từ log thật. Theo mục 2, 3, 4 của bản dự thảo
`du-thao-bi-pilot-va-dx-score-moc3.md` (phương án A, mốc 3).

## Phạm vi pilot: chỉ có lớp BI, chưa có AI 1 và AI 2

- AI 1 (chuẩn hóa địa chỉ) và AI 2 (cảnh báo trễ) **vẫn chưa làm**. Chỉ có
  lớp BI ở dạng pilot.
- Lớp BI chỉ dùng **quy tắc xác định**, không mô hình học máy, không gọi
  LLM bên ngoài. BI chỉ cảnh báo và đề xuất, **không tự đặt hàng**, không
  tự dùng nhân đơn.
- **Không công bố con số hiệu quả nào chưa đo.** Tỷ lệ đúng của bộ kiểm
  tra S11 dưới đây đo trên dữ liệu tổng hợp, không phải trên dữ liệu thật;
  tỷ lệ đề xuất được duyệt / bị từ chối chỉ có ý nghĩa khi đã có quyết
  định thật trong vận hành.

## Endpoint

Tất cả đều yêu cầu đăng nhập (không có `@Public`). Đọc forecast,
anomalies, recommendations, dx-score chỉ cần đăng nhập; quyết định đề xuất
và ghi phản hồi chỉ Quản lý hoặc Quản trị viên (`APPROVER_ROLES`).

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/bi/forecast` | Dự báo nhu cầu theo SKU (+ theo kênh khi đủ dữ liệu). |
| `GET /api/bi/anomalies` | 3 bất thường theo ngưỡng đóng băng; **tác dụng phụ**: tạo đề xuất cho bất thường mới (upsert theo `anomalyKey`, đề xuất đã có quyết định không bao giờ bị ghi đè). |
| `GET /api/bi/recommendations` | Danh sách đề xuất đã sinh ra. |
| `GET /api/bi/recommendations/:id` | 1 đề xuất. |
| `POST /api/bi/recommendations/:id/decision` | Duyệt (`approved`) hoặc từ chối (`rejected`) đề xuất. Từ chối bắt buộc có lý do. Chỉ Quản lý/Quản trị viên. |
| `POST /api/bi/recommendations/:id/feedback` | Ghi phản hồi đối chiếu kết quả thật (`correct: true/false`). Chỉ cho đề xuất đã duyệt, mỗi đề xuất tối đa 1 phản hồi. Chỉ Quản lý/Quản trị viên. |
| `GET /api/bi/feedback` | Danh sách phản hồi đã ghi. |
| `GET /api/bi/dx-score` | Tính DX-Score v1 từ log và lưu 1 snapshot (mỗi lần tính đều lưu). |
| `GET /api/bi/dx-score/latest` | Snapshot mới nhất đã lưu. |

4 endpoint cuối bảng (recommendations, feedback, dx-score/latest) là phần
bổ sung ngoài 3 endpoint trong đặc tả gốc, để đề xuất xem được, trục I đo
được và điểm đã tính tra lại được.

## Dự báo

- Tốc độ bán = số lượng bán trong 7 ngày gần nhất / 7, theo từng SKU và
  theo từng cặp SKU + kênh khi cặp đó có đơn trong cửa sổ (không thì chỉ
  theo SKU). Dự báo 7 ngày tới = tốc độ x 7. Số ngày tồn kho còn lại =
  tồn kho khả dụng hiện tại / tốc độ. Tốc độ 0 thì ghi `khong-ban`, số
  ngày còn lại null, không tính bất thường.
- **Cửa sổ 7 ngày neo vào ngày dữ liệu mới nhất** (`referenceDate` = ngày
  tạo đơn mới nhất, trừ 8 đơn demo DH-1001..DH-1008 vì `createdAt` của
  chúng là thời điểm khởi động API, không phải thời gian nghiệp vụ), không
  neo vào ngày hiện tại và không hardcode 22/11/2026. Trên dữ liệu mẫu
  đóng băng, ngày tham chiếu là 22/11/2026; khi đơn thật (DH-1009 trở đi)
  vào, cửa sổ tự dịch theo.
- Đơn bán trong cửa sổ = đơn ĐÃ GIAO (trạng thái `Đã giao` hoặc `Hoàn`)
  có `createdAt` trong cửa sổ. Đơn chưa giao (Mới tạo, Đã kiểm tra, Chờ
  kho, Đang đóng gói, Chờ điều xe, Đang giao) chưa phải hàng đã bán; đơn
  hủy cũng không phải doanh số. Định nghĩa này khớp số liệu tiền điều kiện
  đã công bố trong `src/seed/data/README.md` (NM-35: 17 đơn vị trong 7
  ngày cuối, mốc 7 đơn vị).

## 3 bất thường (ngưỡng đóng băng, mục 3 bản dự thảo)

1. **Tồn kho sắp hết**: số ngày còn lại < 7 ngày (thời gian nhập hàng đóng
   băng) và có đơn bán trong 7 ngày gần nhất.
2. **Tỷ lệ hoàn kênh cao**: tỷ lệ hoàn của kênh vượt tỷ lệ hoàn chung hơn
   10 điểm phần trăm và kênh có ít nhất 3 đơn hoàn. Tỷ lệ = số đơn hoàn /
   số đơn đã giao (đơn đã giao mới có thể hoàn).
3. **Cầu tăng đột biến**: doanh số 7 ngày gần nhất > 2 lần mốc 7 ngày
   trước đó, mốc ít nhất 5 đơn vị.

Mỗi bất thường mang `key` ổn định (`<loại>:<SKU|kênh>`) và `inputs` ghi rõ
mọi con số đầu vào để người duyệt kiểm tra lại được.

## DX-Score v1 (công thức đóng băng, mục 2 bản dự thảo)

Mỗi trục P, D, I tối đa 30 điểm, H = 100 - P - D - I, tổng 4 trục luôn
bằng 100. Điểm làm tròn 2 chữ số thập phân trước khi cộng H.

- **P** = 30 x (P1 + P2) / 2. P1 = đơn đã đóng đi tròn luồng (lịch sử không
  lặp trạng thái) / tổng đơn đã đóng (Hoàn + Hủy). P2 = lần thử chuyển
  trái phép bị rào chắn chặn lại / tổng lần thử (ghi trong audit với
  action `order.transition.denied`); chưa có lần thử nào thì P2 "chưa đo".
- **D** = 30 x (D1 + D2) / 2. D1 = chỉ số BI kèm nguồn dữ liệu và thời
  điểm đóng băng / tổng chỉ số BI (phạm vi pilot: chỉ số do chính lớp BI
  trả ra, bằng 1 khi có chỉ số, "chưa đo" khi không có). D2 = đơn có phả
  hệ đầy đủ (lịch sử bắt đầu từ tạo đơn + có bản ghi audit `order.created`)
  / tổng đơn.
- **I** = 30 x (đề xuất được duyệt và xác minh đúng / tổng đề xuất đã
  duyệt). Chỉ tính khi có phê duyệt tay; chưa có đề xuất nào được duyệt
  thì I "chưa đo", 0 điểm. Tổng đề xuất đã duyệt < 5 thì ghi "mẫu nhỏ,
  điểm chỉ có giá trị minh họa".
- **H** là phần còn lại, không chấm bằng 1 công thức riêng; 4 chỉ số đo
  trực tiếp từ log đi kèm: tỷ lệ bước làm tay (actor khác `seed` và
  `system` / tổng bản ghi audit), thời gian chờ duyệt trung bình theo loại
  phê duyệt, số quyết định theo người theo ngày theo vai, tỷ lệ ngoại lệ
  (đơn hủy, đơn có trả hàng, hoặc đơn đi đường vòng).

Mẫu số 0 thì trục con đó ghi "chưa đo", tính 0 điểm, không ước lượng.
Mỗi lần tính đều lưu 1 `DXScoreSnapshot` (append-only) kèm công thức, ngày
tham chiếu và thời điểm tính, bấm xuống được log gốc qua các tỷ lệ thành
phần (n, ghi chú). Tính 2 lần trên cùng dữ liệu ra cùng 1 số (có test).

## Số liệu trên dữ liệu mẫu đóng băng (mốc 3)

- Dự báo: 40 dòng SKU. 9 bất thường: 7 tồn kho sắp hết (NM-10, NM-20,
  NM-35, NM-50, NM-CA, NM-RUOC, HS-MUC-500), 1 tỷ lệ hoàn cao (kênh Chat
  45,0% = 9/20 so với chung 18,3% = 13/71), 1 cầu tăng đột biến (NM-35:
  17 đơn vị so với mốc 7 đơn vị). 9 đề xuất, tất cả chờ duyệt.
- DX-Score: **P 15, D 30, I 0, H 55, tổng 100**. P1 = 66/66 (2 đơn giao
  thất bại đích là Chờ điều xe, chưa đóng, nên không tính vào P1), P2 chưa
  đo (chưa có lần thử chuyển trái phép nào trong log). D1 = 1, D2 = 120/120.
  I chưa đo (n = 0). Tỷ lệ ngoại lệ 18/120 = 0,15 (3 đơn hủy + 13 đơn có
  trả hàng + 2 đơn giao thất bại, không trùng nhau). Tỷ lệ bước làm tay
  146/1110 = 0,13 (146 bản ghi audit do tài xế ghi khi xác nhận giao hàng
  và báo giao thất bại, còn lại 964 bản ghi do seed ghi).

## Bộ kiểm tra S11 (mục 4 bản dự thảo)

`bi.service.spec.ts` (mục "S11 pilot test set"): 20 cặp SKU/kênh có nhu
cầu đã biết + 20 tình huống bất thường đã biết (7 tồn kho sắp hết, 7 tỷ
lệ hoàn cao theo kênh, 6 cầu tăng đột biến), xây từ dữ liệu tổng hợp thay
vì dữ liệu mẫu thật (chỉ có 3 kênh thật nên 7 trường hợp hoàn cao là kịch
bản tổng hợp, không phải 7 kênh thật). Trên bộ này: dự báo đúng 20/20 cặp,
phát hiện đúng 20/20 bất thường, không có bất thường ngoài bộ đã biết.
Tỷ lệ đề xuất được duyệt / bị từ chối chưa đo được trong bộ kiểm tra (chưa
có quyết định nào), chỉ đo được khi vận hành thật có người duyệt.

## Cấu trúc

- `bi.types.ts`: kiểu dữ liệu (ForecastRow, Anomaly, Recommendation,
  AIFeedback, DxScore, DxScoreSnapshot, BiStore).
- `bi.compute.ts`: hàm thuần (dự báo, 3 bất thường, DX-Score, bản nháp đề
  xuất). Cùng dữ liệu đầu vào thì luôn trả cùng 1 kết quả.
- `bi.store.ts`: `BI_STORE` (token), `InMemoryBiStore` (test),
  `PostgresBiStore` (lưu bền, migration 012).
- `bi.service.ts`: service (đọc đơn/kho/trả hàng qua service hiện có,
  không tạo store mới cho dữ liệu của mô-đun khác).
- `bi.controller.ts`: endpoint (xem bảng trên).
- `bi.module.ts`: đăng ký mô-đun.
- `bi.service.spec.ts`: test đơn vị từng quy tắc + bộ S11.
- `bi.frozen-data.spec.ts`: test trên dữ liệu mẫu đóng băng thật (nạp seed
  qua đường dịch vụ thật rồi tính).

## Phả hệ dữ liệu

- `GET /api/bi/lineage/latest`: phả hệ của snapshot DX-Score mới nhất.
- `GET /api/bi/lineage/:snapshotId`: phả hệ của một snapshot.
- Trả snapshot, 4 trục P/D/I/H + ratio, nguồn recommendation/feedback/order/
  audit/archive và coverage. Chỉ ID/trạng thái/counts; không trả phone,
  address, tên khách hàng hay audit detail.
- UI hiển thị section “Phả hệ dữ liệu” trong tab Tổng quan của
  `/bi-dx-score`.

## Giới hạn đã chấp nhận

- Lưu nhiều thực thể là các bước tuần tự, không phải 1 giao dịch (giới hạn
  chung của mọi mô-đun, xem ghi chú trong các service khác).
- Số thứ tự mã DX/PH/SN nối tiếp từ kho lúc khởi động (`onModuleInit`
  đọc ID đã lưu, giống dãy DH-/TH- của các service khác): mã mới không
  trùng mã cũ sau khi API khởi động lại, snapshot ghi append-only nên
  không được trùng khóa chính.
- `GET /api/bi/anomalies` có tác dụng phụ: tạo đề xuất cho bất thường mới.
  Đề xuất đã có quyết định không bao giờ bị ghi đè (upsert theo
  `anomalyKey` + ràng buộc `UNIQUE`).
- D1 của trục D đo trong phạm vi pilot (chỉ số do chính lớp BI trả ra),
  chưa đo việc ghi nguồn của toàn bộ hệ thống.
- Số lượng `BIGINT` từ Postgres thật trả về dạng string: mọi phép tính
  trên số đếm từ DB phải ép `Number(...)` trước khi cộng (bài học 16/11).
- Class Nest khởi tạo trực tiếp không có tham số optional kiểu class nếu
  không có `@Optional()`; chỉ kiểm tra khởi động thật (boot smoke) mới bắt
  lỗi DI (bài học 16/11).

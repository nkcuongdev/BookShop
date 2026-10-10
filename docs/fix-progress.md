# Tiến độ sửa theo docs/order-workflow-review.md

Nhánh: `fix/order-workflow-review` (không push). Thứ tự làm theo mục 7.2 của báo cáo, rồi các mục còn lại của 6.6.

Chế độ test: **(A)** — sau mỗi thay đổi chạy các file test backend liên quan (không chạy toàn bộ). Cột "Test đã thêm" ghi tên test và kết quả lần chạy gần nhất. Thay đổi frontend không có test tự động và không được kiểm tra trên trình duyệt (không chạy dev server).

TRANSITIONS trong `backend/src/models/Order.js`: **chưa thay đổi**.

| ID | Trạng thái | Commit | Test đã thêm | Ghi chú |
| --- | --- | --- | --- | --- |
| F01 | ĐÃ SỬA | (xem commit fix(F01,M01,M02)) | orderService.integration: "customer cancels a PENDING COD order directly without an outbox event", "concurrent PENDING cancellations restore stock exactly once", "admin cancels a PENDING online order and a later payment is refunded", "PENDING orders are never moved into CANCELLING" — đã chạy, 38/38 pass; supportTicket.integration 9/9 pass | `requestCancellation` gặp PENDING thì gọi `orderService.cancelPendingOrderInSession` trong cùng transaction: hoàn kho/voucher/điểm, PENDING → CANCELLED (cạnh có sẵn), không tạo outbox. Route khách/admin trả 200 "Đã hủy đơn hàng" thay vì 202. Không đổi TRANSITIONS, không sửa `cancelOrder`/`adminCancelOrder`. |
| M01 | ĐÃ SỬA | (cùng commit F01) | — (frontend) | Sửa chú thích sai trong `constants.js`; dialog admin nói rõ PENDING huỷ ngay, có hoàn điểm; toast admin dùng message server (phân biệt "Đã huỷ" với "đang được xử lý"). Nút huỷ PENDING giờ chạy được nhờ F01. |
| M02 | ĐÃ SỬA | (cùng commit F01) | Test "admin cancels a PENDING online order and a later payment is refunded" + test khoá cạnh PENDING→CANCELLING | Không thêm PENDING→CANCELLING. Callback thanh toán đến sau khi huỷ đi nhánh late-payment có sẵn (CANCELLED → REFUNDING → REFUNDED), kho không bị hoàn hai lần. |
| F29 | CHƯA LÀM | | | |
| F30 | CHƯA LÀM | | | |
| M14 | CHƯA LÀM | | | |
| F22 | CHƯA LÀM | | | |
| F23 | CHƯA LÀM | | | |
| M03 | CHƯA LÀM | | | |
| F08 | CHƯA LÀM | | | |
| M10 | CHƯA LÀM | | | Không có trong danh sách 6.6; xử lý cùng F08/M03 vì cùng nguyên nhân (query refund MoMo). |
| F10 | CHƯA LÀM | | | |
| F13 | CHƯA LÀM | | | |
| F04 | CHƯA LÀM | | | |
| M05 | CHƯA LÀM | | | |
| F14 | CHƯA LÀM | | | |
| F07 | CHƯA LÀM | | | |
| M04 | CHƯA LÀM | | | |
| M06 | CHƯA LÀM | | | |
| M09 | CHƯA LÀM | | | |
| F17 | CHƯA LÀM | | | |
| F12 | CHƯA LÀM | | | |
| F03 | CHƯA LÀM | | | |
| M07 | CHƯA LÀM | | | |
| M08 | CHƯA LÀM | | | |
| F05 | CHƯA LÀM | | | |
| F15 | CHƯA LÀM | | | |
| F11 | CHƯA LÀM | | | |
| M11 | CHƯA LÀM | | | |
| M12 | CHƯA LÀM | | | |
| F16 | CHƯA LÀM | | | |
| F09 | CHƯA LÀM | | | |
| F19 | CHƯA LÀM | | | |
| F25 | CHƯA LÀM | | | |
| F32 | CHƯA LÀM | | | |
| F33 | CHƯA LÀM | | | |
| M13 | CHƯA LÀM | | | |
| F24 | CHƯA LÀM | | | |
| F26 | CHƯA LÀM | | | |
| F27 | CHƯA LÀM | | | |
| F28 | CHƯA LÀM | | | |
| F31 | CHƯA LÀM | | | |
| F34 | CHƯA LÀM | | | |
| F35 | CHƯA LÀM | | | |
| F36 | CHƯA LÀM | | | |
| F37 | CHƯA LÀM | | | |
| F38 | CHƯA LÀM | | | |
| F39 | CHƯA LÀM | | | |
| F40 | CHƯA LÀM | | | |
| F02 | BỎ QUA | — | — | Mục 7.3. |
| F06 | BỎ QUA | — | — | Mục 7.3. |
| F18 | BỎ QUA | — | — | Mục 7.3. |
| F20 | BỎ QUA | — | — | Mục 7.3. |
| F21 | BỎ QUA | — | — | Mục 7.3. |
| Giả lập GHN | BỎ QUA | — | — | Mục 7.3. |

## Lỗi mới phát hiện trong lúc sửa (chưa sửa)

- (chưa có)

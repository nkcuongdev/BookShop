# Tiến độ sửa theo docs/order-workflow-review.md

Nhánh: `fix/order-workflow-review` (không push). Thứ tự làm theo mục 7.2 của báo cáo, rồi các mục còn lại của 6.6.

Chế độ test: **(A)** — sau mỗi thay đổi chạy các file test backend liên quan (không chạy toàn bộ). Cột "Test đã thêm" ghi tên test và kết quả lần chạy gần nhất. Thay đổi frontend không có test tự động và không được kiểm tra trên trình duyệt (không chạy dev server).

TRANSITIONS trong `backend/src/models/Order.js`: **chưa thay đổi**.

| ID | Trạng thái | Commit | Test đã thêm | Ghi chú |
| --- | --- | --- | --- | --- |
| F01 | ĐÃ SỬA | 46aa85f | orderService.integration: "customer cancels a PENDING COD order directly without an outbox event", "concurrent PENDING cancellations restore stock exactly once", "admin cancels a PENDING online order and a later payment is refunded", "PENDING orders are never moved into CANCELLING" — đã chạy, 38/38 pass; supportTicket.integration 9/9 pass | `requestCancellation` gặp PENDING thì gọi `orderService.cancelPendingOrderInSession` trong cùng transaction: hoàn kho/voucher/điểm, PENDING → CANCELLED (cạnh có sẵn), không tạo outbox. Route khách/admin trả 200 "Đã hủy đơn hàng" thay vì 202. Không đổi TRANSITIONS, không sửa `cancelOrder`/`adminCancelOrder`. |
| M01 | ĐÃ SỬA | 46aa85f | — (frontend) | Sửa chú thích sai trong `constants.js`; dialog admin nói rõ PENDING huỷ ngay, có hoàn điểm; toast admin dùng message server (phân biệt "Đã huỷ" với "đang được xử lý"). Nút huỷ PENDING giờ chạy được nhờ F01. |
| M02 | ĐÃ SỬA | 46aa85f | Test "admin cancels a PENDING online order and a later payment is refunded" + test khoá cạnh PENDING→CANCELLING | Không thêm PENDING→CANCELLING. Callback thanh toán đến sau khi huỷ đi nhánh late-payment có sẵn (CANCELLED → REFUNDING → REFUNDED), kho không bị hoàn hai lần. |
| F29 | ĐÃ SỬA | (commit nhóm 2) | frontend OrdersList.test.jsx "keeps the filter toolbar when the order list fails to load" — **chưa chạy** (chế độ A chỉ cho chạy test backend) | OrdersList không thay DataTable bằng ErrorState nữa mà truyền `isError/onRetry` vào DataTable (DataTable đã hỗ trợ sẵn và giữ toolbar). |
| F30 | ĐÃ SỬA | (commit nhóm 2) | frontend `features/admin/orders/timeline.test.js` (5 case) — **chưa chạy** | Logic timeline tách ra `features/admin/orders/timeline.js`: dựng từ `order.history`; COD không có bước PAID; đơn huỷ/thất bại/hoàn tiền hiện đúng nhánh đã đi (bước ngoại lệ tô màu danger). Dữ liệu cũ không có history quay về tiến trình theo phương thức. Chưa hiện thời gian/người thực hiện (thuộc F33). |
| M14 | ĐÃ SỬA | (commit nhóm 2) | — (frontend, không có test) | (1) Bỏ `onError` riêng ở `useOrderAction`/`useReturnRequestAction` để handler mặc định trong `queryClient` hiện thông báo 403 thân thiện. (2) Nút "Xem" `stopPropagation` để không navigate hai lần. (3) Drawer dừng poll khi lỗi (404/403) hoặc đơn CANCELLED/FAILED/REFUNDED. (4) Header `counts.all` vs footer `pagination.total`: chuyển sang F24. (5) Ship thủ công trên đơn GHN: xem dòng M14-GHN. |
| M14-GHN | CẦN QUYẾT ĐỊNH | — | — | API `POST /admin/orders/:id/ship` vẫn cho ship thủ công đơn đang có vận đơn GHN hoạt động (UI đã ẩn nút). Chặn ở backend hay giữ làm đường dự phòng? Xem câu hỏi trong báo cáo cuối phiên. |
| F22 | ĐÃ SỬA | (commit nhóm 2) | orderReport.integration "approved return filter also finds requests approved into RETURNING" — đã chạy, 4/4 pass | Backend: lọc `returnStatus=APPROVED` khớp `$in [APPROVED, RETURNING]`. Admin: option "Đã duyệt, chờ nhận hàng" đếm APPROVED+RETURNING, thêm RECEIVED/CLOSED (enum backend đã chấp nhận). Khách: tab PENDING đổi "Chờ thanh toán" → "Chờ xử lý" (khớp badge); dialog huỷ đơn chưa thanh toán (COD PROCESSING) không còn nói đã thanh toán/hoàn tiền. |
| F23 | ĐÃ SỬA | (commit nhóm 2) | — (frontend) | Giữ nguyên 10 tab. Thêm `tabLabel` chỉ cho tab: PAID → "Đã thanh toán, chờ duyệt", FAILED → "Thanh toán thất bại"; TabsList có aria-label "Lọc theo trạng thái đơn hàng"; dropdown đổi thành "Tất cả trạng thái thanh toán". Chưa thêm preset "COD chờ duyệt" (tránh chật toolbar, F39); hàng đợi này vẫn lấy được bằng tab Chờ xử lý + COD. |
| M03 | ĐÃ SỬA | (commit nhóm 3) | supportLostInTransit: "one broken support refund does not block the rest of the reconciliation queue" — đã chạy, 14/14 pass | `reconcileProcessingRefunds` xử lý từng ticket trong try/catch (hàm mới `reconcileProcessingRefund`), lỗi ghi vào `resolution.refund.lastError`; truy vấn sort `updatedAt` tăng dần để ticket lỗi không chiếm đầu hàng đợi mãi. Kết quả trả thêm `manual`, `errors`. |
| F08 | ĐÃ SỬA | (commit nhóm 3) | supportLostInTransit: "a timed-out support refund is settled from the gateway query reference", "a settled refund without any transaction id is handed to an agent, not retried forever", "a support refund left in REFUND_PENDING by a crash is recovered once stale" — đã chạy, pass; paymentGateway 7/7, returnRequest.integration 7/7, supportTicket.integration 9/9 | (1) `settleProcessingRefund` chấp nhận mã từ query khi ticket chưa lưu mã (timeout); vẫn từ chối mã khác mã đã lưu. (2) Cổng báo hoàn tất nhưng không có mã nào (MoMo) → chuyển `REFUND_MANUAL_REQUIRED` kèm lý do, agent nhập mã qua `completeManualRefund` có sẵn. (3) Ticket kẹt `REFUND_PENDING` quá 15 phút (process chết) được chuyển sang `REFUND_PROCESSING` để đối soát. (4) Mock query trả `refundTransactionId` giống mock request. Nhãn admin "Chờ ghi nhận hoàn COD" → "Chờ ghi nhận hoàn tiền thủ công", thêm nhãn REFUND_PROCESSING. |
| M10 | CẦN QUYẾT ĐỊNH | — | — | Không có trong 6.6. Hệ quả chính (ticket MoMo kẹt) đã được chặn bằng đường thủ công ở F08. Còn lại: `queryRefundStatus` cho MoMo vẫn là stub luôn "hoàn tất"; retry sau timeout dùng lại `orderId`. Viết query MoMo thật cần xác minh định dạng `/v2/gateway/api/refund/query` và cách MoMo xử lý `orderId` trùng — không thể xác minh khi không được gọi API thật. |
| F10 | ĐÃ SỬA | (commit F10) | returnRequest.integration "a line already refunded through support cannot be returned and refunded again"; supportLostInTransit "two support compensations cannot both claim the same line concurrently" — đã chạy: returnRequest 8/8, supportLostInTransit 15/15, supportTicket 9/9 pass | Hàm chung `findSupportLineCompensations` (returnRequestService) liệt kê ticket PARTIAL_REFUND/RESHIP/LOST_IN_TRANSIT_* còn hiệu lực; `createReturnRequest` (cả kiểm tra ngoài và trong transaction) và eligibility ở chi tiết đơn khách cộng cả hai kênh. Phía support, `assertLineEntitlements` dùng lại hàm này và được gọi lại trong transaction của từng phương án (hàm `lockOrderEntitlements` ghi `returnRequestGuardAt` lên đơn — trường có sẵn mà ReturnRequest đã dùng làm khoá) nên hai thao tác đồng thời bị tuần tự hoá. Không đổi schema. |
| F13 | ĐÃ SỬA | (commit F13) | supportLostInTransit "a lost-parcel reship must cover every line not already refunded" — đã chạy, 16/16 pass | Theo cách sửa đơn giản nhất báo cáo đề xuất: `createLostReshipResolution` (trong transaction) bắt buộc danh sách giao lại bằng đúng phần chưa được hoàn qua ticket thất lạc khác của mọi dòng (`assertCompleteLostReship`), lỗi `LOST_RESHIP_MUST_BE_COMPLETE`. Không đổi logic giao thành công. Mô tả phương án trên panel admin ghi rõ yêu cầu này. Hệ quả: không còn giao lại một phần kiện thất lạc. |
| F04 | CẦN QUYẾT ĐỊNH | — | — | Xác nhận còn đúng: `processOne` (orderCancellationService) retry mãi khi `cancelGhnShipmentAtProvider` ném lỗi (backoff tối đa 1 giờ), outbox chỉ có PENDING/PROCESSING/COMPLETED, không có lối thoát. Lối thoát thật (đơn quay về PROCESSING/SHIPPED khi hãng đã lấy hàng) cần thêm cạnh `CANCELLING → PROCESSING/SHIPPED` vào TRANSITIONS, hoặc phải chốt chính sách xử lý thủ công. Xem câu hỏi ở báo cáo cuối phiên. |
| M05 | ĐÃ SỬA | (commit M05) | supportLostInTransit "a late delivered webhook does not deliver an order already declared lost" — đã chạy, 17/17 pass; orderService.integration 38/38; shippingService 4/4 | `syncGhnWebhook` (cũng là đường của giả lập Sandbox) không tự chuyển DELIVERED khi đơn có ticket LOST_IN_TRANSIT_* còn hiệu lực; vẫn ghi tracking event. Khi hãng báo "delivered" mà đơn không thành DELIVERED (có hồ sơ thất lạc, hoặc đơn đã REFUNDED/CANCELLING… trước đây bị nuốt lỗi im lặng) thì gửi thông báo cho admin (một lần cho mỗi sự kiện mới). Không đổi TRANSITIONS. Việc xử lý tiếp (giao rồi điều chỉnh điểm, huỷ kiện giao lại…) để agent quyết định. |
| F14 | ĐÃ SỬA | (commit F14) | supportLostInTransit "lost-parcel refunds split across tickets refund the fee and close the order" — đã chạy, 18/18 pass | (1) `closeLostOrderWhenFullyRefunded` xét tổng `supportCompensation.refundedAmount` đọc lại trong transaction, không so riêng số tiền ticket hiện tại. (2) Ticket hoàn thất lạc phủ hết các dòng còn lại nhận phần tiền còn lại của đơn (gồm phí giao), giống một lần hoàn toàn bộ; các ticket trước vẫn tính theo dòng. Hàm `coversAllOutstandingLines` dùng chung với F13. Voucher/điểm đã dùng khi hoàn thất lạc từng phần: xem M13. |
| F07 | ĐÃ SỬA | (commit F07,M09) | orderService.integration "an accepted refund that later fails is resubmitted under a new key" — đã chạy, 39/39 pass | Vòng query trong `reconcilePendingRefunds` trước đây bỏ qua `failed:true`. Nay `rearmFailedRefund`: xoá `refundTransactionId`, cấp idempotency key mới (`refund-retry:<orderCode>:<uuid>`), đặt `refundNextRetryAt = now`, ghi `refundLastError` kèm mã refund thất bại → vòng gửi lại có sẵn (`executePendingRefund`) xử lý. Đơn đang kẹt hiện tại được cứu ở lượt chạy kế tiếp nếu cổng vẫn báo failed, không cần migration. Chưa có lịch sử từng lần hoàn riêng (chỉ lastError). |
| M04 | ĐÃ SỬA | (commit M04) | returnRequest.integration "a refund the gateway rejects outright goes back to the retry queue" (mở rộng: đổi key, hết lượt → MANUAL_REQUIRED, đóng thủ công) — đã chạy, 8/8 pass | (1) Cổng báo `failed` → về PENDING với idempotency key mới (`return-refund-retry:<id>:<uuid>`) và xoá `refund.transactionId`. (2) `recordReturnRefundFailure`: sau 15 lần gửi thất bại (`MAX_AUTOMATIC_REFUND_RETRIES`, backoff tối đa 1 giờ ≈ nửa ngày) chuyển `MANUAL_REQUIRED`; nhân viên đóng bằng mã giao dịch qua `closeManualReturn` có sẵn. (3) Card admin hiện `lastError` khi đang thử lại/cần thủ công; câu "Đơn COD cần hoàn tiền thủ công" đổi thành câu chung (đúng cả với đơn online). Con số 15 là lựa chọn của tôi, có thể chỉnh. |
| M06 | ĐÃ SỬA | (commit M06) | supportLostInTransit "a lost refund still settles when staff moved the order on meanwhile" — đã chạy, 19/19 pass | `closeLostOrderWhenFullyRefunded` chỉ gọi `completeLostInTransitRefund` khi đơn còn SHIPPED/REFUNDING/REFUNDED; nếu nhân viên đã chuyển đơn đi (ví dụ đánh dấu đã giao) thì vẫn ghi nhận khoản hoàn và hoàn tất ticket thay vì ném lỗi làm rollback cả quyết toán. Không sửa `completeLostInTransitRefund`. Webhook giao muộn đã được chặn ở M05 nên đường còn lại là thao tác tay. |
| M09 | ĐÃ SỬA | (commit F07,M09) | cùng test trên (phần backoff) | Hàng đợi query refund đã được cổng nhận: chỉ lấy đơn đến hạn `refundNextRetryAt`, sort tăng dần; kết quả chưa xong thì `deferRefundQuery` lùi lịch theo `refundRetryDelay` (1 phút → tối đa 1 giờ). Dùng trường có sẵn, không đổi schema. |
| F17 | ĐÃ SỬA | (commit F17) | returnRequest.integration "a received return with nothing left to refund closes instead of hanging" — đã chạy, 9/9 pass | `receiveReturnRequest`: khi số tiền hoàn bằng 0 (hạn mức đơn đã dùng hết) thì đóng hồ sơ luôn (`CLOSED`, `closedAt`, `refund.status = NONE`) trong cùng transaction nhận hàng, sau đó `syncLinkedTicket` để ticket RETURN_REFUND hoàn tất. Card khách và admin hiện "Không phát sinh hoàn tiền" thay vì "cổng đang hoàn tiền". Báo cáo lợi nhuận đã tính cả RECEIVED và CLOSED nên không đổi. |
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

- `backend/src/services/returnRequestService.js` (có sẵn trên `main`, 6 dòng): chuỗi tiếng Việt bị lỗi mã hoá kép (mojibake), ví dụ `returnInstructions` mặc định "Vui lÃ²ng Ä‘Ã³ng gÃ³i…" trong `resolveReturnRequest`. Khách sẽ thấy chữ lỗi trong hướng dẫn trả hàng.

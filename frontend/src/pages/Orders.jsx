import { useState, useEffect } from "react";
import { Link, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ordersAPI, booksAPI } from "../services/api.js";
import { formatVND } from "../utils/format.js";

// Status badge component
function StatusBadge({ status }) {
  const statusStyles = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    shipped: "bg-cyan-100 text-cyan-700 border-cyan-200",
    delivered: "bg-green-100 text-green-700 border-green-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
  };

  const statusLabels = {
    pending: "Chờ xử lý",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    delivered: "Đã giao",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
  };

  const statusIcons = {
    pending: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
          clipRule="evenodd"
        />
      </svg>
    ),
    completed: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
    cancelled: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        statusStyles[status] || statusStyles.pending
      }`}
    >
      {statusIcons[status] || statusIcons.pending}
      {statusLabels[status] || status}
    </span>
  );
}

// Order Detail Component
function OrderDetail({ order, books, onBack }) {
  const location = useLocation();
  const justCreated = location.state?.justCreated;
  const orderId = order?._id || order?.id || "";

  if (!order) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-secondary-800 mb-2">
          Không tìm thấy đơn hàng
        </h2>
        <p className="text-secondary-500 mb-6">
          Đơn hàng này không tồn tại hoặc bạn không có quyền truy cập.
        </p>
        <button
          onClick={onBack}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Quay lại
        </button>
      </div>
    );
  }

  const total = order.totalAmount || order.total || 0;

  return (
    <div>
      {justCreated && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <svg
            className="w-6 h-6 text-green-500 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="font-semibold text-green-800">Đặt hàng thành công!</p>
            <p className="text-sm text-green-700 mt-0.5">
              Chúng tôi sẽ liên hệ với bạn sớm để xác nhận đơn hàng.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-secondary-500 hover:text-primary-600 font-medium transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Quay lại
        </button>
        <StatusBadge status={order.status} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-secondary-800">
                Đơn hàng #{orderId.slice(-8).toUpperCase()}
              </h2>
              <p className="text-secondary-500 text-sm mt-1">
                Ngày đặt:{" "}
                {new Date(order.createdAt).toLocaleDateString("vi-VN")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-secondary-500">Tổng tiền</p>
              <p className="text-2xl font-bold text-primary-600">
                {formatVND(total)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-secondary-800 mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-secondary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Địa chỉ giao hàng
          </h3>
          <div className="text-secondary-600 text-sm space-y-1">
            <p className="font-medium text-secondary-800">
              {order.shippingAddress?.fullName}
            </p>
            <p>{order.shippingAddress?.phone}</p>
            <p>{order.shippingAddress?.address}</p>
          </div>
        </div>

        <div className="p-6">
          <h3 className="font-semibold text-secondary-800 mb-4">
            Sản phẩm ({order.items?.length || 0})
          </h3>
          <div className="space-y-4">
            {order.items?.map((item, index) => {
              const itemBookId = item.book?._id || item.book || item.bookId;
              const book = books[itemBookId];
              return (
                <div
                  key={index}
                  className="flex gap-4 p-4 bg-gray-50 rounded-xl"
                >
                  <Link to={`/books/${itemBookId}`} className="flex-shrink-0">
                    <img
                      src={
                        book?.imageUrl || "https://via.placeholder.com/80x120"
                      }
                      alt={item.title}
                      className="w-16 h-24 object-cover rounded-lg shadow-sm hover:shadow-md transition-shadow"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/books/${itemBookId}`}
                      className="font-medium text-secondary-800 hover:text-primary-600 transition-colors line-clamp-2"
                    >
                      {item.title}
                    </Link>
                    <p className="text-secondary-500 text-sm mt-1">
                      Số lượng: {item.quantity}
                    </p>
                    <p className="text-primary-600 font-semibold mt-2">
                      {formatVND(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-secondary-600">
              <span>Tạm tính</span>
              <span className="font-medium text-secondary-800">
                {formatVND(total)}
              </span>
            </div>
            <div className="flex justify-between text-secondary-600">
              <span>Phí vận chuyển</span>
              <span className="text-green-600 font-medium">Miễn phí</span>
            </div>
            <div className="flex justify-between text-secondary-600">
              <span>Phương thức thanh toán</span>
              <span className="font-medium text-secondary-800">
                Thanh toán khi nhận hàng (COD)
              </span>
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-200 text-lg">
              <span className="font-semibold text-secondary-800">
                Tổng cộng
              </span>
              <span className="font-bold text-primary-600">
                {formatVND(total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Orders List Component
function OrdersList({ orders, books, onSelectOrder }) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-secondary-800 mb-2">
          Chưa có đơn hàng nào
        </h2>
        <p className="text-secondary-500 mb-6 max-w-sm mx-auto">
          Khi bạn đặt hàng, đơn hàng sẽ xuất hiện ở đây.
        </p>
        <Link
          to="/products"
          className="inline-flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25"
        >
          Bắt đầu mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const orderId = order._id || order.id;
        const total = order.totalAmount || order.total || 0;
        return (
          <div
            key={orderId}
            onClick={() => onSelectOrder(orderId)}
            className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-secondary-800 group-hover:text-primary-600 transition-colors">
                    Đơn hàng #{orderId.slice(-8).toUpperCase()}
                  </h3>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-secondary-500 text-sm">
                  {new Date(order.createdAt).toLocaleDateString("vi-VN")}
                </p>
                <p className="text-secondary-600 text-sm mt-1">
                  {order.items?.length || 0} sản phẩm
                </p>
              </div>
              <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                <p className="text-xl font-bold text-primary-600">
                  {formatVND(total)}
                </p>
                <span className="text-primary-600 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Xem chi tiết
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <div className="flex -space-x-2">
                {order.items?.slice(0, 3).map((item, index) => {
                  const itemBookId = item.book?._id || item.book || item.bookId;
                  const book = books[itemBookId];
                  return (
                    <img
                      key={index}
                      src={book?.imageUrl || "https://via.placeholder.com/40"}
                      alt={item.title}
                      className="w-10 h-10 object-cover rounded-lg border-2 border-white shadow-sm"
                    />
                  );
                })}
              </div>
              {order.items?.length > 3 && (
                <span className="text-secondary-500 text-sm">
                  +{order.items.length - 3} sản phẩm khác
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Main Orders Page
export default function Orders() {
  const { user } = useAuth();
  const { orderId } = useParams();
  const [selectedOrderId, setSelectedOrderId] = useState(orderId || null);
  const [orders, setOrders] = useState([]);
  const [books, setBooks] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      if (!user) return;

      try {
        const response = await ordersAPI.getMyOrders();
        if (response.success) {
          setOrders(response.data.orders);

          // Collect unique book IDs
          const bookIds = new Set();
          response.data.orders.forEach((order) => {
            order.items?.forEach((item) => {
              const bookId = item.book?._id || item.book || item.bookId;
              if (bookId) bookIds.add(bookId);
            });
          });

          // Fetch book details
          const booksData = {};
          for (const bookId of bookIds) {
            try {
              const bookRes = await booksAPI.getById(bookId);
              if (bookRes.success) {
                booksData[bookId] = bookRes.data.book;
              }
            } catch (e) {}
          }
          setBooks(booksData);
        }
      } catch (error) {
        console.error("Error loading orders:", error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const selectedOrder = selectedOrderId
    ? orders.find((o) => (o._id || o.id) === selectedOrderId)
    : null;

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary-500">Đang tải đơn hàng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedOrderId ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-secondary-800">
                Đơn hàng của tôi
              </h1>
              <p className="text-secondary-500 mt-1">
                Theo dõi và quản lý đơn hàng
              </p>
            </div>
            <OrdersList
              orders={orders}
              books={books}
              onSelectOrder={setSelectedOrderId}
            />
          </>
        ) : (
          <OrderDetail
            order={selectedOrder}
            books={books}
            onBack={() => setSelectedOrderId(null)}
          />
        )}
      </div>
    </div>
  );
}

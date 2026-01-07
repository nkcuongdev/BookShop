import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatVND } from "../utils/format.js";

export default function Cart() {
  const { items, removeItem, updateQuantity, totalPrice, totalItems } =
    useCart();
  const { user } = useAuth();

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
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
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-secondary-800 mb-2">
            Giỏ hàng trống
          </h1>
          <p className="text-secondary-500 mb-8 max-w-sm mx-auto">
            Bạn chưa thêm sách nào vào giỏ hàng. Hãy khám phá bộ sưu tập của
            chúng tôi!
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 bg-primary-500 text-white px-8 py-3 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25"
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
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            Xem sách
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-secondary-800">
              Giỏ hàng
            </h1>
            <p className="text-secondary-500 mt-1">
              {totalItems} sản phẩm trong giỏ hàng
            </p>
          </div>
          <Link
            to="/products"
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium transition-colors"
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
            Tiếp tục mua sắm
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.book.id}
                className="bg-white rounded-2xl shadow-sm p-4 sm:p-6"
              >
                <div className="flex gap-4 sm:gap-6">
                  <Link to={`/books/${item.book.id}`} className="flex-shrink-0">
                    <img
                      src={item.book.imageUrl}
                      alt={item.book.title}
                      className="w-20 h-28 sm:w-24 sm:h-32 object-cover rounded-xl shadow-md hover:shadow-lg transition-shadow"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-4">
                      <div>
                        <Link
                          to={`/books/${item.book.id}`}
                          className="font-semibold text-secondary-800 hover:text-primary-600 transition-colors line-clamp-2"
                        >
                          {item.book.title}
                        </Link>
                        <p className="text-secondary-500 text-sm mt-1">
                          {item.book.author}
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem(item.book.id)}
                        aria-label="Xóa sản phẩm"
                        className="flex-shrink-0 p-2 text-secondary-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-end justify-between mt-4">
                      <div className="flex items-center bg-gray-100 rounded-xl">
                        <button
                          onClick={() =>
                            updateQuantity(item.book.id, item.quantity - 1)
                          }
                          aria-label="Giảm số lượng"
                          className="px-3 py-2 text-secondary-600 hover:text-secondary-800 hover:bg-gray-200 rounded-l-xl transition-colors"
                        >
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
                              d="M20 12H4"
                            />
                          </svg>
                        </button>
                        <span className="px-4 py-2 font-semibold text-secondary-800 min-w-[48px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.book.id, item.quantity + 1)
                          }
                          aria-label="Tăng số lượng"
                          className="px-3 py-2 text-secondary-600 hover:text-secondary-800 hover:bg-gray-200 rounded-r-xl transition-colors"
                        >
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
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary-600">
                          {formatVND(item.book.price * item.quantity)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-sm text-secondary-400">
                            {formatVND(item.book.price)}/cuốn
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-24">
              <h2 className="text-xl font-semibold text-secondary-800 mb-6">
                Thông tin đơn hàng
              </h2>
              <div className="space-y-4 pb-6 border-b border-gray-100">
                <div className="flex justify-between text-secondary-600">
                  <span>Tạm tính ({totalItems} sản phẩm)</span>
                  <span className="font-medium text-secondary-800">
                    {formatVND(totalPrice)}
                  </span>
                </div>
                <div className="flex justify-between text-secondary-600">
                  <span>Phí vận chuyển</span>
                  <span className="text-green-600 font-medium">Miễn phí</span>
                </div>
              </div>
              <div className="flex justify-between py-6 border-b border-gray-100">
                <span className="text-lg font-semibold text-secondary-800">
                  Tổng cộng
                </span>
                <span className="text-2xl font-bold text-primary-600">
                  {formatVND(totalPrice)}
                </span>
              </div>

              <div className="py-6 border-b border-gray-100">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Mã giảm giá"
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                  />
                  <button className="px-4 py-2.5 bg-gray-100 text-secondary-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                    Áp dụng
                  </button>
                </div>
              </div>

              <div className="pt-6">
                {user ? (
                  <Link
                    to="/checkout"
                    className="flex items-center justify-center gap-2 w-full bg-primary-500 text-white py-3.5 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30"
                  >
                    Tiến hành thanh toán
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
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <Link
                      to="/login"
                      className="flex items-center justify-center gap-2 w-full bg-primary-500 text-white py-3.5 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25"
                    >
                      Đăng nhập để thanh toán
                    </Link>
                    <p className="text-center text-secondary-500 text-sm">
                      Chưa có tài khoản?{" "}
                      <Link
                        to="/register"
                        className="text-primary-600 hover:underline font-medium"
                      >
                        Đăng ký
                      </Link>
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-center gap-6 text-secondary-400">
                  <div className="flex items-center gap-1.5 text-xs">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Bảo mật
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
                    </svg>
                    Miễn phí ship
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    COD
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import MainLayout from "./layouts/MainLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import ProfileLayout from "./layouts/ProfileLayout.jsx";
import Home from "./pages/Home.jsx";
import ProductList from "./pages/ProductList.jsx";
import BookDetail from "./pages/BookDetail.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import PaymentResult from "./pages/PaymentResult.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import NewsList from "./pages/NewsList.jsx";
import NewsDetail from "./pages/NewsDetail.jsx";
import ProfileOverview from "./pages/profile/ProfileOverview.jsx";
import ProfileOrders from "./pages/profile/ProfileOrders.jsx";
import OrderDetail from "./pages/profile/OrderDetail.jsx";
import ProfileAddresses from "./pages/profile/ProfileAddresses.jsx";
import ProfileWishlist from "./pages/profile/ProfileWishlist.jsx";
import ProfilePassword from "./pages/profile/ProfilePassword.jsx";
import { Skeleton } from "./components/ui/skeleton.jsx";

const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const BooksList = lazy(() => import("./pages/admin/books/BooksList.jsx"));
const BookFormPage = lazy(() => import("./pages/admin/books/BookFormPage.jsx"));
const CategoriesList = lazy(() =>
  import("./pages/admin/categories/CategoriesList.jsx")
);
const OrdersList = lazy(() => import("./pages/admin/orders/OrdersList.jsx"));
const UsersList = lazy(() => import("./pages/admin/users/UsersList.jsx"));
const VouchersList = lazy(() =>
  import("./pages/admin/vouchers/VouchersList.jsx")
);
const PromotionsList = lazy(() =>
  import("./pages/admin/promotions/PromotionsList.jsx")
);
const ChatSupport = lazy(() => import("./pages/admin/chat/ChatSupport.jsx"));
const PostsList = lazy(() => import("./pages/admin/posts/PostsList.jsx"));
const PostFormPage = lazy(() => import("./pages/admin/posts/PostFormPage.jsx"));
const PostCategoriesList = lazy(() =>
  import("./pages/admin/posts/PostCategoriesList.jsx")
);

function AdminPageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

function LazyAdmin({ children }) {
  return <Suspense fallback={<AdminPageFallback />}>{children}</Suspense>;
}

function RedirectToProfileOrder() {
  const { orderId } = useParams();
  return <Navigate to={`/profile/orders/${orderId}`} replace />;
}

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment-result" element={<PaymentResult />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/news" element={<NewsList />} />
        <Route path="/news/:slug" element={<NewsDetail />} />

        <Route path="/profile" element={<ProfileLayout />}>
          <Route index element={<ProfileOverview />} />
          <Route path="orders" element={<ProfileOrders />} />
          <Route path="orders/:orderId" element={<OrderDetail />} />
          <Route path="addresses" element={<ProfileAddresses />} />
          <Route path="wishlist" element={<ProfileWishlist />} />
          <Route path="password" element={<ProfilePassword />} />
        </Route>

        <Route path="/orders" element={<Navigate to="/profile/orders" replace />} />
        <Route
          path="/orders/:orderId"
          element={<RedirectToProfileOrder />}
        />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route
          index
          element={
            <LazyAdmin>
              <AdminDashboard />
            </LazyAdmin>
          }
        />
        <Route
          path="books"
          element={
            <LazyAdmin>
              <BooksList />
            </LazyAdmin>
          }
        />
        <Route
          path="books/new"
          element={
            <LazyAdmin>
              <BookFormPage mode="create" />
            </LazyAdmin>
          }
        />
        <Route
          path="books/:id/edit"
          element={
            <LazyAdmin>
              <BookFormPage mode="edit" />
            </LazyAdmin>
          }
        />
        <Route
          path="categories"
          element={
            <LazyAdmin>
              <CategoriesList />
            </LazyAdmin>
          }
        />
        <Route
          path="orders"
          element={
            <LazyAdmin>
              <OrdersList />
            </LazyAdmin>
          }
        />
        <Route
          path="orders/:id"
          element={
            <LazyAdmin>
              <OrdersList />
            </LazyAdmin>
          }
        />
        <Route
          path="users"
          element={
            <LazyAdmin>
              <UsersList />
            </LazyAdmin>
          }
        />
        <Route
          path="vouchers"
          element={
            <LazyAdmin>
              <VouchersList />
            </LazyAdmin>
          }
        />
        <Route
          path="promotions"
          element={
            <LazyAdmin>
              <PromotionsList />
            </LazyAdmin>
          }
        />
        <Route
          path="chat"
          element={
            <LazyAdmin>
              <ChatSupport />
            </LazyAdmin>
          }
        />
        <Route
          path="posts"
          element={
            <LazyAdmin>
              <PostsList />
            </LazyAdmin>
          }
        />
        <Route
          path="posts/new"
          element={
            <LazyAdmin>
              <PostFormPage mode="create" />
            </LazyAdmin>
          }
        />
        <Route
          path="posts/:id/edit"
          element={
            <LazyAdmin>
              <PostFormPage mode="edit" />
            </LazyAdmin>
          }
        />
        <Route
          path="posts/categories"
          element={
            <LazyAdmin>
              <PostCategoriesList />
            </LazyAdmin>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;

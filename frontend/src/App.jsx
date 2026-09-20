import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import MainLayout from "./layouts/MainLayout.jsx";
import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";
import { Skeleton } from "./components/ui/skeleton.jsx";
import { RequirePermission } from "./components/admin/common/RequirePermission.jsx";

const AdminLayout = lazy(() => import("./layouts/AdminLayout.jsx"));
const ProfileLayout = lazy(() => import("./layouts/ProfileLayout.jsx"));
const ProductList = lazy(() => import("./pages/ProductList.jsx"));
const BookDetail = lazy(() => import("./pages/BookDetail.jsx"));
const Cart = lazy(() => import("./pages/Cart.jsx"));
const Checkout = lazy(() => import("./pages/Checkout.jsx"));
const PaymentResult = lazy(() => import("./pages/PaymentResult.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail.jsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.jsx"));
const NewsletterConfirm = lazy(() => import("./pages/NewsletterConfirm.jsx"));
const NewsletterUnsubscribe = lazy(() => import("./pages/NewsletterUnsubscribe.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const NewsList = lazy(() => import("./pages/NewsList.jsx"));
const NewsDetail = lazy(() => import("./pages/NewsDetail.jsx"));
const ProfileOverview = lazy(() => import("./pages/profile/ProfileOverview.jsx"));
const ProfileOrders = lazy(() => import("./pages/profile/ProfileOrders.jsx"));
const OrderDetail = lazy(() => import("./pages/profile/OrderDetail.jsx"));
const ProfileAddresses = lazy(() => import("./pages/profile/ProfileAddresses.jsx"));
const ProfileWishlist = lazy(() => import("./pages/profile/ProfileWishlist.jsx"));
const ProfilePassword = lazy(() => import("./pages/profile/ProfilePassword.jsx"));
const ProfileNotifications = lazy(() => import("./pages/profile/ProfileNotifications.jsx"));
const MyPermissions = lazy(() => import("./pages/profile/MyPermissions.jsx"));
const ProfilePoints = lazy(() => import("./pages/profile/ProfilePoints.jsx"));
const PointsRewards = lazy(() => import("./pages/profile/PointsRewards.jsx"));
const SupportTickets = lazy(() => import("./pages/profile/SupportTickets.jsx"));
const SupportTicketDetail = lazy(() => import("./pages/profile/SupportTicketDetail.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const BooksList = lazy(() => import("./pages/admin/books/BooksList.jsx"));
const BookFormPage = lazy(() => import("./pages/admin/books/BookFormPage.jsx"));
const CategoriesList = lazy(() =>
  import("./pages/admin/categories/CategoriesList.jsx")
);
const OrdersList = lazy(() => import("./pages/admin/orders/OrdersList.jsx"));
const UsersList = lazy(() => import("./pages/admin/users/UsersList.jsx"));
const RolesMatrix = lazy(() => import("./pages/admin/roles/RolesMatrix.jsx"));
const RoleFormPage = lazy(() => import("./pages/admin/roles/RoleFormPage.jsx"));
const LoyaltyMembersList = lazy(() =>
  import("./pages/admin/loyalty/LoyaltyMembersList.jsx")
);
const MemberPointsHistory = lazy(() =>
  import("./pages/admin/loyalty/MemberPointsHistory.jsx")
);
const LoyaltyRewardsList = lazy(() =>
  import("./pages/admin/loyalty/RewardsList.jsx")
);
const LoyaltySettings = lazy(() =>
  import("./pages/admin/loyalty/LoyaltySettings.jsx")
);
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
const ReviewsList = lazy(() => import("./pages/admin/reviews/ReviewsList.jsx"));
const NewsletterManager = lazy(() =>
  import("./pages/admin/newsletter/NewsletterManager.jsx")
);
const SupportTicketQueue = lazy(() => import("./pages/admin/support/SupportTicketQueue.jsx"));
const AdminSupportTicketDetail = lazy(() => import("./pages/admin/support/SupportTicketDetail.jsx"));
const SuppliersList = lazy(() => import("./pages/admin/suppliers/SuppliersList.jsx"));
const StockReceiptsList = lazy(() =>
  import("./pages/admin/inventory/StockReceiptsList.jsx")
);
const StockReceiptForm = lazy(() =>
  import("./pages/admin/inventory/StockReceiptForm.jsx")
);
const StockIssuesList = lazy(() =>
  import("./pages/admin/inventory/StockIssuesList.jsx")
);
const StockIssueForm = lazy(() =>
  import("./pages/admin/inventory/StockIssueForm.jsx")
);
const StockCountsList = lazy(() =>
  import("./pages/admin/inventory/StockCountsList.jsx")
);
const StockCountSheet = lazy(() =>
  import("./pages/admin/inventory/StockCountSheet.jsx")
);
const StockLedgerPage = lazy(() =>
  import("./pages/admin/inventory/StockLedgerPage.jsx")
);
const LowStockPage = lazy(() => import("./pages/admin/inventory/LowStockPage.jsx"));
const ProfitReport = lazy(() =>
  import("./pages/admin/reports/ProfitReport.jsx")
);
const AuditLogPage = lazy(() => import("./pages/admin/audit/AuditLogPage.jsx"));

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

/**
 * Customer routes must NOT use AdminPageFallback — an admin dashboard skeleton
 * (title + 4 stat cards + chart block) flashing on the storefront reads as a
 * broken page. This mirrors the shared storefront shape instead: a page-header
 * band followed by a content block.
 */
function CustomerPageFallback() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-8 w-72" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function LazyAdmin({ children }) {
  return <Suspense fallback={<AdminPageFallback />}>{children}</Suspense>;
}

/**
 * Unknown /admin/* URL. Handled inside the admin branch so the sidebar and
 * topbar stay in place instead of dropping to the storefront 404.
 */
function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-h2 font-display font-bold text-foreground">
        Không tìm thấy trang
      </h1>
      <p className="text-sm text-muted-foreground">
        Đường dẫn quản trị này không tồn tại.
      </p>
    </div>
  );
}

function RedirectToProfileOrder() {
  const { orderId } = useParams();
  return <Navigate to={`/profile/orders/${orderId}`} replace />;
}

function App() {
  return (
    <Suspense fallback={<CustomerPageFallback />}>
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
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/newsletter/confirm" element={<NewsletterConfirm />} />
        <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/support/shipping" element={<SupportPage type="shipping" />} />
        <Route path="/support/returns" element={<SupportPage type="returns" />} />
        <Route path="/support/faq" element={<SupportPage type="faq" />} />
        <Route path="/support/contact" element={<SupportPage type="contact" />} />
        <Route path="/news" element={<NewsList />} />
        <Route path="/news/:slug" element={<NewsDetail />} />

        <Route path="/profile" element={<ProfileLayout />}>
          <Route index element={<ProfileOverview />} />
          <Route path="orders" element={<ProfileOrders />} />
          <Route path="orders/:orderId" element={<OrderDetail />} />
          <Route path="addresses" element={<ProfileAddresses />} />
          <Route path="wishlist" element={<ProfileWishlist />} />
          <Route path="notifications" element={<ProfileNotifications />} />
          <Route path="support" element={<SupportTickets />} />
          <Route path="support/:ticketId" element={<SupportTicketDetail />} />
          <Route path="points" element={<ProfilePoints />} />
          <Route path="points/rewards" element={<PointsRewards />} />
          <Route path="password" element={<ProfilePassword />} />
          <Route path="permissions" element={<MyPermissions />} />
        </Route>

        <Route path="/orders" element={<Navigate to="/profile/orders" replace />} />
        <Route
          path="/orders/:orderId"
          element={<RedirectToProfileOrder />}
        />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route
          index
          element={
            <RequirePermission permission="dashboard.view">
              <LazyAdmin>
                <AdminDashboard />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="books"
          element={
            <RequirePermission permission="book.read">
              <LazyAdmin>
                <BooksList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="books/new"
          element={
            <RequirePermission permission="book.write">
              <LazyAdmin>
                <BookFormPage mode="create" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="books/:id/edit"
          element={
            <RequirePermission permission="book.write">
              <LazyAdmin>
                <BookFormPage mode="edit" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="categories"
          element={
            <RequirePermission permission="category.manage">
              <LazyAdmin>
                <CategoriesList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="orders"
          element={
            <RequirePermission permission="order.read">
              <LazyAdmin>
                <OrdersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RequirePermission permission="order.read">
              <LazyAdmin>
                <OrdersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="roles"
          element={
            <RequirePermission permission="role.read">
              <LazyAdmin>
                <RolesMatrix />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="audit-logs"
          element={
            <RequirePermission permission="audit.read">
              <LazyAdmin>
                <AuditLogPage />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="roles/new"
          element={
            <RequirePermission permission="role.manage">
              <LazyAdmin>
                <RoleFormPage mode="create" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="roles/:key"
          element={
            <RequirePermission permission="role.manage">
              <LazyAdmin>
                <RoleFormPage mode="edit" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permission="user.manage">
              <LazyAdmin>
                <UsersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="vouchers"
          element={
            <RequirePermission permission="voucher.manage">
              <LazyAdmin>
                <VouchersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="loyalty/members"
          element={
            <RequirePermission permission="loyalty.read">
              <LazyAdmin>
                <LoyaltyMembersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="loyalty/members/:userId"
          element={
            <RequirePermission permission="loyalty.read">
              <LazyAdmin>
                <MemberPointsHistory />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="loyalty/rewards"
          element={
            <RequirePermission permission="loyalty.read">
              <LazyAdmin>
                <LoyaltyRewardsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="loyalty/settings"
          element={
            <RequirePermission permission="loyalty.read">
              <LazyAdmin>
                <LoyaltySettings />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="promotions"
          element={
            <RequirePermission permission="promotion.manage">
              <LazyAdmin>
                <PromotionsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="support"
          element={
            <RequirePermission permission="ticket.read">
              <LazyAdmin>
                <SupportTicketQueue />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="support/:ticketId"
          element={
            <RequirePermission permission="ticket.read">
              <LazyAdmin>
                <AdminSupportTicketDetail />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="chat"
          element={
            <RequirePermission permission="chat.read">
              <LazyAdmin>
                <ChatSupport />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="posts"
          element={
            <RequirePermission permission="post.read">
              <LazyAdmin>
                <PostsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="posts/new"
          element={
            <RequirePermission permission="post.write">
              <LazyAdmin>
                <PostFormPage mode="create" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="posts/:id/edit"
          element={
            <RequirePermission permission="post.write">
              <LazyAdmin>
                <PostFormPage mode="edit" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="posts/categories"
          element={
            <RequirePermission permission="postCategory.manage">
              <LazyAdmin>
                <PostCategoriesList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="newsletter"
          element={
            <RequirePermission permission="newsletter.manage">
              <LazyAdmin>
                <NewsletterManager />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="reviews"
          element={
            <RequirePermission permission="review.moderate">
              <LazyAdmin>
                <ReviewsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />

        {/* Warehouse management */}
        <Route
          path="suppliers"
          element={
            <RequirePermission permission="supplier.read">
              <LazyAdmin>
                <SuppliersList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/receipts"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockReceiptsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/receipts/new"
          element={
            <RequirePermission permission="inventory.write">
              <LazyAdmin>
                <StockReceiptForm mode="create" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/receipts/:id"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockReceiptForm mode="edit" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/issues"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockIssuesList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/issues/new"
          element={
            <RequirePermission permission="inventory.write">
              <LazyAdmin>
                <StockIssueForm mode="create" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/issues/:id"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockIssueForm mode="edit" />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/counts"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockCountsList />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/counts/:id"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockCountSheet />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/ledger"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <StockLedgerPage />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="inventory/low-stock"
          element={
            <RequirePermission permission="inventory.read">
              <LazyAdmin>
                <LowStockPage />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route
          path="reports/profit"
          element={
            <RequirePermission permission="analytics.view">
              <LazyAdmin>
                <ProfitReport />
              </LazyAdmin>
            </RequirePermission>
          }
        />
        <Route path="*" element={<AdminNotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default App;

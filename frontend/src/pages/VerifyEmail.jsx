import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { BadgeCheck, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { authAPI } from "@/services/api";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const token = searchParams.get("token") || "";
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState({
    loading: false,
    success: false,
    error: "",
    emailChanged: false,
  });
  const [resendStatus, setResendStatus] = useState({
    loading: false,
    message: "",
    error: "",
    verificationUrl: location.state?.verificationUrl || "",
  });

  const resend = async () => {
    setResendStatus((current) => ({
      ...current,
      loading: true,
      message: "",
      error: "",
    }));
    try {
      const response = await authAPI.requestEmailVerification();
      setResendStatus({
        loading: false,
        message: response.message || "Đã gửi lại email xác minh.",
        error: "",
        verificationUrl: response.data?.verificationUrl || "",
      });
    } catch (error) {
      setResendStatus((current) => ({
        ...current,
        loading: false,
        error: error.message,
      }));
    }
  };

  const verify = async () => {
    setStatus({ loading: true, success: false, error: "", emailChanged: false });
    try {
      const response = await authAPI.verifyEmail(token);
      const emailChanged = Boolean(response.data?.emailChanged);
      if (!response.data?.reauthRequired) await refreshUser();
      setStatus({ loading: false, success: true, error: "", emailChanged });
    } catch (error) {
      setStatus({
        loading: false,
        success: false,
        error: error.message,
        emailChanged: false,
      });
    }
  };

  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/[0.06] shadow-rest">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <Mail className="size-6" />
          </div>
          <h1 className="text-h1 font-display font-bold text-foreground">
            Kiểm tra email của bạn
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {user?.email
              ? `BookShop đã tạo liên kết xác minh cho ${user.email}.`
              : "Mở liên kết trong email để xác minh tài khoản."}
          </p>
          {location.state?.verificationEmailSent === false && (
            <p className="mt-3 text-sm text-warning-strong">
              Email chưa gửi được. Bạn có thể thử gửi lại bên dưới.
            </p>
          )}
          {resendStatus.message && (
            <p className="mt-4 text-sm text-success-strong">{resendStatus.message}</p>
          )}
          {resendStatus.error && (
            <p className="mt-4 text-sm text-danger-strong">{resendStatus.error}</p>
          )}
          {user ? (
            <Button
              className="mt-6 w-full"
              onClick={resend}
              disabled={resendStatus.loading}
            >
              {resendStatus.loading ? "Đang gửi..." : "Gửi lại email xác minh"}
            </Button>
          ) : (
            <Button asChild className="mt-6 w-full">
              <Link to="/login">Đăng nhập để gửi lại</Link>
            </Button>
          )}
          {resendStatus.verificationUrl && (
            <Button asChild variant="outline" className="mt-3 w-full">
              <a href={resendStatus.verificationUrl}>Mở liên kết xác minh (development)</a>
            </Button>
          )}
          <Button asChild variant="ghost" className="mt-3 w-full">
            <Link to="/">Về trang chủ</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/[0.06] shadow-rest">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-success-muted text-success-strong">
          <BadgeCheck className="size-6" />
        </div>
        <h1 className="text-h1 font-display font-bold text-foreground">
          Xác minh email
        </h1>
        {status.success ? (
          <>
            <p className="mt-4 text-sm text-success-strong">
              {status.emailChanged
                ? "Email đăng nhập đã được đổi. Vui lòng đăng nhập lại bằng email mới."
                : "Email đã được xác minh thành công."}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to={status.emailChanged || !user ? "/login" : "/profile"}>
                Tiếp tục
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Xác nhận để hoàn tất việc xác minh địa chỉ email của bạn.
            </p>
            {status.error && <p className="mt-4 text-sm text-danger-strong">{status.error}</p>}
            <Button className="mt-6 w-full" onClick={verify} disabled={!token || status.loading}>
              {status.loading ? "Đang xác minh..." : "Xác minh email"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

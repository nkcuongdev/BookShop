import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { authAPI } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState({ loading: false, success: false, error: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmation) {
      setStatus({ loading: false, success: false, error: "Mật khẩu xác nhận không khớp" });
      return;
    }
    setStatus({ loading: true, success: false, error: "" });
    try {
      await authAPI.resetPassword(token, password);
      setStatus({ loading: false, success: true, error: "" });
    } catch (error) {
      setStatus({ loading: false, success: false, error: error.message });
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 ring-1 ring-foreground/[0.06] shadow-rest">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <KeyRound className="size-6" />
        </div>
        <h1 className="text-center text-h1 font-display font-bold text-foreground">
          Đặt lại mật khẩu
        </h1>

        {!token ? (
          <p className="mt-5 rounded-xl bg-danger-muted p-3 text-sm text-danger-strong">
            Liên kết đặt lại mật khẩu không hợp lệ.
          </p>
        ) : status.success ? (
          <div className="mt-6 text-center">
            <p className="rounded-xl bg-success-muted p-3 text-sm text-success-strong">
              Mật khẩu đã được cập nhật. Các phiên đăng nhập cũ đã bị thu hồi.
            </p>
            <Button asChild className="mt-5 w-full">
              <Link to="/login">Đăng nhập lại</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
            <Input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
            {status.error && <p className="text-sm text-danger-strong">{status.error}</p>}
            <Button className="w-full" disabled={status.loading}>
              {status.loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

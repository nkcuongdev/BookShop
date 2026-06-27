import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { authAPI } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ loading: false, message: "", error: "" });

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, message: "", error: "" });
    try {
      const response = await authAPI.forgotPassword(email.trim());
      setStatus({ loading: false, message: response.message, error: "" });
    } catch (error) {
      setStatus({ loading: false, message: "", error: error.message });
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 ring-1 ring-foreground/[0.06] shadow-rest">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <Mail className="size-6" />
        </div>
        <h1 className="text-center text-h1 font-display font-bold text-foreground">
          Quên mật khẩu
        </h1>
        <p className="mt-2 text-center text-base text-muted-foreground">
          Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            autoComplete="email"
            required
          />
          <Button className="w-full" disabled={status.loading}>
            {status.loading ? "Đang gửi..." : "Gửi hướng dẫn"}
          </Button>
        </form>

        {status.message && (
          <p className="mt-4 rounded-xl bg-success-muted p-3 text-sm text-success-strong">
            {status.message}
          </p>
        )}
        {status.error && (
          <p className="mt-4 rounded-xl bg-danger-muted p-3 text-sm text-danger-strong">
            {status.error}
          </p>
        )}
        <Link to="/login" className="mt-6 block text-center text-sm text-primary hover:underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { newsletterAPI } from "@/services/api";
import { Button } from "@/components/ui/button";

export default function NewsletterConfirm() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState({ loading: false, success: false, error: "" });

  const confirm = async () => {
    setStatus({ loading: true, success: false, error: "" });
    try {
      await newsletterAPI.confirm(token);
      setStatus({ loading: false, success: true, error: "" });
    } catch (error) {
      setStatus({ loading: false, success: false, error: error.message });
    }
  };

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/[0.06] shadow-rest">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-success-muted text-success-strong">
          <MailCheck className="size-6" />
        </div>
        <h1 className="text-h1 font-display font-bold text-foreground">
          Xác nhận nhận tin
        </h1>
        {status.success ? (
          <>
            <p className="mt-4 text-sm text-success-strong">
              Email của bạn đã được xác nhận. Cảm ơn bạn đã đăng ký.
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to="/products">Khám phá sách</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Xác nhận để bắt đầu nhận ưu đãi và gợi ý sách từ BookShop.
            </p>
            {status.error && <p className="mt-4 text-sm text-danger-strong">{status.error}</p>}
            <Button className="mt-6 w-full" onClick={confirm} disabled={!token || status.loading}>
              {status.loading ? "Đang xác nhận..." : "Xác nhận đăng ký"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

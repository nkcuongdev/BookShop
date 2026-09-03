import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MailX } from "lucide-react";
import { newsletterAPI } from "@/services/api";
import { Button } from "@/components/ui/button";

export default function NewsletterUnsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState({
    loading: false,
    success: false,
    message: "",
    error: "",
  });

  const unsubscribe = async () => {
    setStatus({ loading: true, success: false, message: "", error: "" });
    try {
      const response = await newsletterAPI.unsubscribe(token);
      setStatus({
        loading: false,
        success: true,
        message: response?.message || "Đã hủy đăng ký nhận newsletter.",
        error: "",
      });
    } catch (error) {
      setStatus({
        loading: false,
        success: false,
        message: "",
        error: error.message || "Không thể hủy đăng ký.",
      });
    }
  };

  return (
    <div className="flex min-h-[65vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/[0.06] shadow-rest">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-danger-muted text-danger-strong">
          <MailX className="size-6" />
        </div>
        <h1 className="font-display text-h1 font-bold text-foreground">
          Hủy đăng ký nhận tin
        </h1>
        {status.success ? (
          <>
            <p className="mt-4 text-sm text-success-strong">{status.message}</p>
            <p className="mt-2 text-base text-muted-foreground">
              Bạn sẽ không nhận thêm email newsletter từ BookShop. Bạn vẫn có thể đăng ký lại bất cứ lúc nào.
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to="/">Về trang chủ</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Xác nhận rằng bạn không muốn tiếp tục nhận bài viết và ưu đãi qua email.
            </p>
            {status.error && (
              <p className="mt-4 text-sm text-danger-strong">{status.error}</p>
            )}
            <Button
              variant="destructive"
              className="mt-6 w-full"
              onClick={unsubscribe}
              disabled={!token || status.loading}
            >
              {status.loading ? "Đang xử lý..." : "Xác nhận hủy đăng ký"}
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link to="/">Giữ đăng ký và quay lại</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

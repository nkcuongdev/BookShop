import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotFoundIllustration } from "@/components/common/illustrations";

export default function NotFound() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center px-4 py-12 text-center">
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-slow ease-out-soft">
        <NotFoundIllustration className="mx-auto h-32 w-40 text-primary" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-primary">
          404
        </p>
        <h1 className="mt-2 text-h1 font-display font-bold text-foreground">
          Không tìm thấy trang
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Địa chỉ có thể đã thay đổi hoặc nội dung không còn tồn tại.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Về trang chủ
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/products">
              <Search className="size-4" />
              Tìm sách
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Mail,
  Phone,
  MapPin,
  Send,
  Globe,
  Camera,
  MessageCircle,
  Video,
} from "lucide-react";
import { useCategories } from "@/context/CategoryContext.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { newsletterAPI } from "@/services/api";

function safeSocialUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

const SOCIAL_LINKS = [
  { label: "Facebook", href: safeSocialUrl(import.meta.env.VITE_SOCIAL_FACEBOOK_URL), Icon: Globe },
  { label: "Instagram", href: safeSocialUrl(import.meta.env.VITE_SOCIAL_INSTAGRAM_URL), Icon: Camera },
  { label: "Zalo", href: safeSocialUrl(import.meta.env.VITE_SOCIAL_ZALO_URL), Icon: MessageCircle },
  { label: "YouTube", href: safeSocialUrl(import.meta.env.VITE_SOCIAL_YOUTUBE_URL), Icon: Video },
].filter((item) => item.href);

export default function Footer() {
  const { categories } = useCategories();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Vui lòng nhập email hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      const response = await newsletterAPI.subscribe(normalizedEmail);
      toast.success(response.message || "Vui lòng kiểm tra email để xác nhận đăng ký.");
      setEmail("");
    } catch (error) {
      toast.error(error.message || "Không thể đăng ký nhận tin");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="bg-gradient-to-br from-deep via-deep-soft to-deep text-deep-foreground mt-12">
      {/* Newsletter */}
      <div className="border-b border-white/10">
        <div className="page-container py-10 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h3 className="text-h2 font-display font-bold">
              Đăng ký nhận tin
            </h3>
            <p className="text-sm text-white/60 mt-1">
              Nhận ưu đãi độc quyền & gợi ý sách hay mỗi tuần.
            </p>
          </div>
          <form
            onSubmit={handleSubscribe}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email của bạn"
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/15"
              required
              maxLength={254}
            />
            <Button type="submit" size="lg" className="shrink-0" loading={submitting}>
              <Send className="size-4" />
              {submitting ? "Đang gửi..." : "Đăng ký"}
            </Button>
          </form>
        </div>
      </div>

      {/* Main */}
      <div className="page-container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="size-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center shadow-primary-glow">
                <BookOpen className="size-5 text-white" />
              </div>
              <span className="text-xl font-display font-bold">BookShop</span>
            </Link>
            <p className="text-sm text-white/60 mb-5 leading-relaxed">
              Thế giới sách phong phú, giá tốt, giao nhanh và dịch vụ tận tâm.
            </p>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2.5">
                <MapPin className="size-4 text-primary-400 mt-0.5 shrink-0" />
                123 Đường Sách, Quận Hai Bà Trưng, Hà Nội
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 text-primary-400 shrink-0" />
                <a href="tel:19001234" className="hover:text-primary-300">1900 1234</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 text-primary-400 shrink-0" />
                <a href="mailto:hello@bookshop.vn" className="hover:text-primary-300">hello@bookshop.vn</a>
              </li>
            </ul>
          </div>

          {/* Shop */}
          <div>
            <h4 className="mb-4 text-base font-display font-semibold">Mua sắm</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <Link to="/products" className="hover:text-primary-300">
                  Tất cả sách
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=bestseller"
                  className="hover:text-primary-300"
                >
                  Bán chạy
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=newest"
                  className="hover:text-primary-300"
                >
                  Mới cập nhật
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=price-asc"
                  className="hover:text-primary-300"
                >
                  Giá tốt nhất
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="mb-4 text-base font-display font-semibold">Danh mục</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              {categories.slice(0, 6).map((cat) => {
                const slug = cat.slug || cat._id || cat.id;
                return (
                  <li key={slug}>
                    <Link
                      to={`/products?category=${slug}`}
                      className="hover:text-primary-300 line-clamp-1"
                    >
                      {cat.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-4 text-base font-display font-semibold">Hỗ trợ</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <Link to="/profile/orders" className="hover:text-primary-300">
                  Tra cứu đơn hàng
                </Link>
              </li>
              <li>
                <Link to="/support/shipping" className="hover:text-primary-300">
                  Chính sách vận chuyển
                </Link>
              </li>
              <li>
                <Link to="/support/returns" className="hover:text-primary-300">
                  Đổi trả & hoàn tiền
                </Link>
              </li>
              <li>
                <Link to="/support/faq" className="hover:text-primary-300">
                  Câu hỏi thường gặp
                </Link>
              </li>
              <li>
                <Link to="/support/contact" className="hover:text-primary-300">
                  Liên hệ
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-white/10">
        <div className="page-container py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50 text-center md:text-left">
            © {new Date().getFullYear()} BookShop. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <Link to="/terms" className="hover:text-primary-300">
              Điều khoản
            </Link>
            <Link to="/privacy" className="hover:text-primary-300">
              Bảo mật
            </Link>
          </div>
          {SOCIAL_LINKS.length > 0 && <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="size-9 rounded-lg bg-white/5 hover:bg-primary flex items-center justify-center transition-colors"
                aria-label={`BookShop trên ${label}`}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>}
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span>Chấp nhận:</span>
            <span className="px-2 py-1 rounded bg-white/10">VISA</span>
            <span className="px-2 py-1 rounded bg-white/10">MoMo</span>
            <span className="px-2 py-1 rounded bg-white/10">COD</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

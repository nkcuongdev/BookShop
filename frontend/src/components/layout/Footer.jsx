import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Mail,
  Phone,
  MapPin,
  Send,
  Globe,
  MessageCircle,
  Camera,
  Video,
} from "lucide-react";
import { useCategories } from "@/context/CategoryContext.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

export default function Footer() {
  const { categories } = useCategories();
  const [email, setEmail] = useState("");

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Vui lòng nhập email hợp lệ");
      return;
    }
    toast.success("Đã đăng ký nhận tin! Cảm ơn bạn.");
    setEmail("");
  };

  return (
    <footer className="bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900 text-white mt-12">
      {/* Newsletter */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h3 className="text-2xl font-display font-bold">
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
            />
            <Button type="submit" size="lg" className="shrink-0">
              <Send className="w-4 h-4" />
              Đăng ký
            </Button>
          </form>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-display font-bold">BookShop</span>
            </Link>
            <p className="text-sm text-white/60 mb-5 leading-relaxed">
              Thế giới sách phong phú, giá tốt, giao nhanh và dịch vụ tận tâm.
            </p>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                123 Đường Sách, Quận 1, TP.HCM
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-primary-400 shrink-0" />
                1900 1234
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-primary-400 shrink-0" />
                hello@bookshop.vn
              </li>
            </ul>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-display font-semibold mb-4">Mua sắm</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <Link to="/products" className="hover:text-primary-400">
                  Tất cả sách
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=bestseller"
                  className="hover:text-primary-400"
                >
                  Bán chạy
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=newest"
                  className="hover:text-primary-400"
                >
                  Mới cập nhật
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sort=price-asc"
                  className="hover:text-primary-400"
                >
                  Giá tốt nhất
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-display font-semibold mb-4">Danh mục</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              {categories.slice(0, 6).map((cat) => {
                const slug = cat.slug || cat._id || cat.id;
                return (
                  <li key={slug}>
                    <Link
                      to={`/products?category=${slug}`}
                      className="hover:text-primary-400 line-clamp-1"
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
            <h4 className="font-display font-semibold mb-4">Hỗ trợ</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <Link to="/profile/orders" className="hover:text-primary-400">
                  Tra cứu đơn hàng
                </Link>
              </li>
              <li>
                <a href="#" className="hover:text-primary-400">
                  Chính sách vận chuyển
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-400">
                  Đổi trả & hoàn tiền
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-400">
                  Câu hỏi thường gặp
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-400">
                  Liên hệ
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50 text-center md:text-left">
            © {new Date().getFullYear()} BookShop. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {[Globe, Camera, MessageCircle, Video].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-primary-500 flex items-center justify-center transition-colors"
                aria-label="Social"
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
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

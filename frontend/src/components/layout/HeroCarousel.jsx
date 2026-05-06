import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_SLIDES = [
  {
    eyebrow: "Chào mừng đến với BookShop",
    title: "Khám phá",
    highlight: "Thế giới sách",
    description:
      "Bộ sưu tập đa dạng với hàng ngàn đầu sách — từ văn học, kinh tế đến kỹ năng sống.",
    ctaLabel: "Khám phá ngay",
    ctaTo: "/products",
    image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=700",
  },
  {
    eyebrow: "Ưu đãi thành viên",
    title: "Giảm đến",
    highlight: "30% cho sách bán chạy",
    description:
      "Hàng trăm đầu sách best-seller được giảm giá mỗi tuần. Đăng ký để không bỏ lỡ.",
    ctaLabel: "Xem sách bán chạy",
    ctaTo: "/products?sort=bestseller",
    image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=700",
  },
  {
    eyebrow: "Mới ra mắt",
    title: "Những cuốn sách",
    highlight: "Đáng đọc nhất tháng",
    description:
      "Cập nhật liên tục với những tựa sách mới nhất từ các tác giả yêu thích.",
    ctaLabel: "Khám phá sách mới",
    ctaTo: "/products?sort=newest",
    image: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=700",
  },
];

export default function HeroCarousel({ slides = DEFAULT_SLIDES }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count]);

  const current = slides[index];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl" />
      </div>

      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-primary-300 px-4 py-1.5 rounded-full text-xs font-semibold mb-5">
              <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
              {current.eyebrow}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.05] tracking-tight">
              {current.title}
              <span className="block bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
                {current.highlight}
              </span>
            </h1>

            <p className="mt-5 text-base lg:text-lg text-secondary-300 max-w-lg mx-auto lg:mx-0">
              {current.description}
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button asChild size="xl" className="shadow-xl shadow-primary-500/30">
                <Link to={current.ctaTo}>
                  <BookOpen className="w-5 h-5" />
                  {current.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/products?sort=bestseller">Sách bán chạy</Link>
              </Button>
            </div>

            {/* Dots */}
            <div className="mt-8 flex items-center justify-center lg:justify-start gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-8 bg-primary-400" : "w-4 bg-white/30"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative h-[460px]">
              {slides.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute inset-0 transition-all duration-700",
                    i === index
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 pointer-events-none"
                  )}
                >
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="relative w-64 h-96 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                      <img
                        src={s.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute -left-6 top-8 w-40 h-56 rounded-2xl overflow-hidden shadow-xl -rotate-12 opacity-80">
                      <img
                        src={s.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute -right-4 bottom-8 w-40 h-56 rounded-2xl overflow-hidden shadow-xl rotate-6 opacity-80">
                      <img
                        src={s.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Arrows */}
        <button
          onClick={() => setIndex((i) => (i - 1 + count) % count)}
          aria-label="Previous"
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIndex((i) => (i + 1) % count)}
          aria-label="Next"
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 items-center justify-center transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroBookShowcase from "@/components/layout/HeroBookShowcase";

/**
 * The homepage hero: one message, one primary action.
 *
 * Replaces HeroCarousel, which rotated three competing pitches on a 7s timer.
 * A carousel splits the hero's job three ways — the visitor reads a third of
 * one message before it moves — and every slide after the first is effectively
 * unread. This states the single thing the page is for (browse the catalogue)
 * and gets out of the way.
 *
 * Gone with the carousel: the timer, dots, arrows, swipe handling, the live
 * region, the invented "4.9/5 from 2,300+ reviews" stats, and three Unsplash
 * photos. What is left is warm paper, real covers from the API, and two links.
 *
 * The palette is the existing light editorial one — card/cream, `brand-muted`,
 * `primary-50` — with indigo and orange as accents only. The hero stays a LIGHT
 * surface on a light site: a dark block here is what forced the trust row below
 * it to bridge a seam with a negative margin.
 *
 * The showcase beside the copy is a 3D shelf of fixed artwork (see
 * HeroBookShowcase) — it takes no props and fetches nothing, so the hero is
 * complete on first paint. The copy column is deliberately the narrower of the
 * two so the shelf has room to run past its own cell.
 */
export default function HomeHero() {
  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative isolate overflow-hidden border-b border-border bg-gradient-to-br from-brand-muted/50 via-card to-primary-50"
    >
      {/* Backdrop: two soft washes, no motion. Purely tonal — nothing here is
          load-bearing, so it stays behind the content at -z-10. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-24 -top-32 size-[28rem] rounded-full bg-primary-100/50 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-[24rem] rounded-full bg-brand-muted/50 blur-3xl" />
      </div>

      {/* Mobile spacing is deliberately tight. At 390×844 the visible area is
          not 844px — the announcement bar, header and the fixed bottom nav take
          roughly 240px of it. The copy has to leave room for the shelf inside
          what is left, so the mobile scale steps down (text-h1, py-8, gap-6)
          rather than reusing the desktop display size. */}
      <div className="page-container py-8 sm:py-14 lg:flex lg:min-h-[clamp(34rem,64vh,38rem)] lg:items-center lg:py-16">
        <div className="grid w-full items-center gap-6 sm:gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          {/* ── Copy ───────────────────────────────────────────────────────── */}
          <div className="max-w-xl text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-slow motion-safe:ease-out-soft lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-semibold tracking-wide text-primary-700 ring-1 ring-inset ring-primary-200">
              <span className="size-1.5 rounded-full bg-brand" />
              BookShop tuyển chọn
            </span>

            <h1
              id="home-hero-title"
              className="mt-4 text-h1 font-display font-bold text-foreground sm:mt-6 sm:text-display lg:text-display-lg lg:leading-[1.15]"
            >
              Khám phá cuốn sách tiếp theo dành cho bạn
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:mt-4 sm:text-base lg:mx-0 lg:mt-5 lg:max-w-lg lg:text-lg">
              Hàng ngàn đầu sách chọn lọc — từ văn học, kinh tế đến kỹ năng
              sống. Tìm đúng cuốn bạn cần trong bộ sưu tập của chúng tôi.
            </p>

            <div className="mt-6 flex flex-col items-center gap-4 sm:mt-8 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                asChild
                size="lg"
                className="w-full shadow-primary-glow sm:w-auto sm:h-14 sm:px-10"
              >
                <Link to="/products">
                  <BookOpen className="size-5" />
                  Khám phá sách
                  <ArrowRight className="size-4" />
                </Link>
              </Button>

              {/* A text link, not a second button: two equally-weighted buttons
                  make neither of them the primary action. */}
              <Link
                to="/products?sort=bestseller"
                className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary-700 underline-offset-4 transition-colors duration-fast ease-out-soft hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Xem sách bán chạy
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          {/* ── Showcase ─────────────────────────────────────────────────────
              Takes no data: the shelf is fixed artwork, so it renders the same
              on first paint whether or not the catalogue has loaded. */}
          {/* No max-width: the shelf sizes itself from the viewport (its slots
              are all `clamp(..vw..)`) and deliberately overflows its cell so it
              reads as continuing past the frame. Capping it here would undo
              both. */}
          <HeroBookShowcase className="w-full motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-slow motion-safe:ease-out-soft" />
        </div>
      </div>
    </section>
  );
}

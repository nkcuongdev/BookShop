import { Link } from "react-router-dom";
import { ArrowRight, Gift } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { MEMBER_STRIP } from "@/features/home/banners";
import { cn } from "@/lib/utils";

/**
 * Slim brand strip that breaks up the run of category sections on the home
 * page. Copy and links live in features/home/banners.js (MEMBER_STRIP);
 * signed-in customers get the link to their points instead of sign-up.
 */
export default function MemberStrip({ content = MEMBER_STRIP, className }) {
  const { user } = useAuth();
  if (!content?.enabled) return null;
  const cta = user && content.memberCta ? content.memberCta : content.cta;

  return (
    <section
      aria-label={content.eyebrow}
      className={cn(
        "relative isolate overflow-hidden rounded-lg bg-gradient-to-r from-primary-800 via-primary-700 to-primary-600 px-5 py-6 text-white shadow-lift sm:px-8 lg:px-10",
        className
      )}
    >
      {/* Soft decorative rings, purely visual. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-10 -top-16 size-56 rounded-full border-[28px] border-white/[0.06]" />
        <div className="absolute -bottom-20 right-1/4 size-40 rounded-full bg-brand/20 blur-3xl" />
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4 sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/20 lg:size-14">
            <Gift className="size-6 text-brand-muted lg:size-7" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-200 sm:text-xs">
              {content.eyebrow}
            </p>
            <h2 className="mt-1 text-balance font-display text-lg font-bold leading-snug sm:text-xl lg:text-2xl">
              {content.title}
            </h2>
            {content.description && (
              <p className="mt-1 text-sm text-white/75">{content.description}</p>
            )}
          </div>
        </div>

        <Link
          to={cta.href}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-card px-5 text-sm font-semibold text-primary-800 shadow-rest transition-[transform,background-color] duration-base ease-out-soft hover:-translate-y-0.5 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700 sm:self-auto"
        >
          {cta.label}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

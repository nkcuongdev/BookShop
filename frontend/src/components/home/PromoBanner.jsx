import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext.jsx";
import BannerImage from "@/components/home/BannerImage";
import { cn } from "@/lib/utils";

// Rendered width: a third of the container on desktop, half on tablets and
// most of the screen in the phone scroller.
const PROMO_SIZES = "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 86vw";

/** One fixed banner beside the carousel. The whole artwork is the link. */
export default function PromoBanner({ banner, className }) {
  const { user } = useAuth();
  const href = user && banner.memberHref ? banner.memberHref : banner.href;

  return (
    <Link
      to={href}
      draggable={false}
      className={cn(
        "group/promo relative block aspect-[1983/793] overflow-hidden rounded-lg bg-primary-50 shadow-rest ring-1 ring-foreground/[0.06] transition-[box-shadow,transform] duration-base ease-out-soft hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-inset after:ring-primary focus-visible:after:ring-[3px]",
        className
      )}
    >
      <BannerImage
        banner={banner}
        sizes={PROMO_SIZES}
        className="transition-[filter] duration-slow ease-out-soft group-hover/promo:brightness-[1.04]"
      />
    </Link>
  );
}

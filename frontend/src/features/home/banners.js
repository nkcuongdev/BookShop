/**
 * Homepage banner content.
 *
 * Every banner is a finished artwork (its copy is printed in the image), so
 * the page only lays the images out and links them — it never overlays text.
 * To change a campaign, put new files in `public/banners/` and edit this file.
 *
 * Fields
 *  - src: full-size image, served from /public.
 *  - srcSmall (optional): a 960px-wide copy for phones, offered via srcset.
 *  - width / height: intrinsic size. Every banner must use the shared ratio
 *    BANNER_WIDTH : BANNER_HEIGHT — the layout in HomeBanners.jsx is computed
 *    from it so nothing is cropped or letterboxed.
 *  - alt: the text printed in the artwork, for screen readers and as the
 *    fallback when the image fails to load.
 *  - href: where a click goes. Must be an existing storefront route.
 *  - memberHref (optional): used instead of `href` for signed-in customers.
 *  - activeFrom / activeUntil (optional, ISO date-time): the banner shows only
 *    inside this window, so a finished campaign disappears by itself.
 */

/** Intrinsic size shared by every banner artwork. */
export const BANNER_WIDTH = 1983;
export const BANNER_HEIGHT = 793;

const size = { width: BANNER_WIDTH, height: BANNER_HEIGHT };

export const HERO_SLIDES = [
  {
    id: "hoi-sach-thang-10",
    src: "/banners/hoi-sach-thang-10.webp",
    srcSmall: "/banners/hoi-sach-thang-10-960.webp",
    ...size,
    alt: "Hội sách tháng 10 — Ưu đãi đến 40%. Khám phá những cuốn sách bạn yêu",
    href: "/products?sort=bestseller",
    activeUntil: "2026-10-31T23:59:59+07:00",
  },
  {
    id: "tuan-le-van-hoc-viet",
    src: "/banners/tuan-le-van-hoc-viet.webp",
    srcSmall: "/banners/tuan-le-van-hoc-viet-960.webp",
    ...size,
    alt: "Tuần lễ Văn học Việt — Giảm đến 30% từ 10/10 đến 20/10. Nhập mã VANHOC30",
    href: "/products?category=van-hoc",
    activeUntil: "2026-10-20T23:59:59+07:00",
  },
  {
    id: "cay-cam-ngot-cua-toi",
    src: "/banners/cay-cam-ngot-cua-toi.webp",
    srcSmall: "/banners/cay-cam-ngot-cua-toi-960.webp",
    ...size,
    alt: "BookShop giới thiệu: Cây Cam Ngọt Của Tôi — José Mauro de Vasconcelos. Câu chuyện về tuổi thơ, tình yêu thương và lòng trắc ẩn",
    // A search rather than /books/:id — book ids differ between databases.
    href: `/products?search=${encodeURIComponent("Cây Cam Ngọt Của Tôi")}`,
  },
];

export const SIDE_BANNERS = [
  {
    id: "uu-dai-thanh-vien",
    src: "/banners/uu-dai-thanh-vien.webp",
    srcSmall: "/banners/uu-dai-thanh-vien-960.webp",
    ...size,
    alt: "Ưu đãi thành viên — Giảm thêm 10%",
    href: "/register",
    memberHref: "/profile/points/rewards",
  },
  {
    id: "sach-ky-nang-song",
    src: "/banners/sach-ky-nang-song.webp",
    srcSmall: "/banners/sach-ky-nang-song-960.webp",
    ...size,
    alt: "Sách kỹ năng sống — Tốt hơn mỗi ngày",
    href: "/products?category=ky-nang-song",
  },
];

/**
 * Slim strip between the category sections. Built in code (no artwork), so
 * its copy lives here. Points rates are set by the admin, so the copy stays
 * general rather than quoting a rate that can change. There is no public
 * endpoint for the loyalty program's on/off switch, so if the program is
 * turned off in the admin, set `enabled: false` here too.
 */
export const MEMBER_STRIP = {
  enabled: true,
  eyebrow: "Thành viên BookShop",
  title: "Mua sách tích điểm, đổi voucher và quà tặng",
  description: "Mỗi đơn hàng đều được cộng điểm. Lên hạng để nhận thêm ưu đãi.",
  cta: { label: "Đăng ký miễn phí", href: "/register" },
  memberCta: { label: "Xem điểm của bạn", href: "/profile/points" },
};

/** Autoplay interval for the main carousel. */
export const HERO_INTERVAL_MS = 6000;

/** Keeps the banners whose activeFrom / activeUntil window contains `now`. */
export function activeBanners(banners, now = Date.now()) {
  return banners.filter((banner) => {
    const from = banner.activeFrom ? Date.parse(banner.activeFrom) : -Infinity;
    const until = banner.activeUntil ? Date.parse(banner.activeUntil) : Infinity;
    return now >= from && now <= until;
  });
}

/** `srcset` for a banner: the 960px copy plus the full-size original. */
export function bannerSrcSet(banner) {
  if (!banner.srcSmall) return undefined;
  return `${banner.srcSmall} 960w, ${banner.src} ${banner.width}w`;
}

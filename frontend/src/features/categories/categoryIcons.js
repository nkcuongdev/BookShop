/**
 * Icons a category can wear on the storefront.
 *
 * The admin picks one in the category form and its `key` is stored on the
 * category (`Category.icon`). Keys are therefore persistent data: add new
 * entries freely, but never rename or remove a key that may be in use — a
 * category holding an unknown key quietly falls back to the guessed icon.
 *
 * The artwork is Fluent Emoji (flat) by Microsoft, MIT licensed, vendored as
 * one SVG per key in public/category-icons/<key>.svg (see LICENSE.txt there).
 * To add an icon, drop the SVG in that folder under the new key and add an
 * entry here. `keywords` are slug-style (no diacritics) and drive the guess
 * for categories that have no icon chosen.
 */
export const CATEGORY_ICONS = [
  { key: "book-open", label: "Sách chung", keywords: [] },
  { key: "feather", label: "Văn học", keywords: ["van-hoc", "tieu-thuyet", "truyen-ngan", "tho", "van-xuoi", "tan-van", "literature", "fiction", "novel"] },
  { key: "trending-up", label: "Kinh tế", keywords: ["kinh-te", "tai-chinh", "dau-tu", "chung-khoan", "marketing", "ban-hang", "economics", "finance"] },
  { key: "briefcase", label: "Kinh doanh", keywords: ["kinh-doanh", "quan-tri", "quan-ly", "khoi-nghiep", "lanh-dao", "business", "management"] },
  { key: "sprout", label: "Kỹ năng sống", keywords: ["ky-nang", "phat-trien-ban-than", "self-help", "song-dep", "thanh-cong"] },
  { key: "brain", label: "Tâm lý", keywords: ["tam-ly", "cam-xuc", "tri-tue", "psychology"] },
  { key: "languages", label: "Ngoại ngữ", keywords: ["ngoai-ngu", "tieng-anh", "tieng-nhat", "tieng-han", "tieng-trung", "tu-dien", "ielts", "toeic", "language", "english"] },
  { key: "graduation-cap", label: "Giáo dục", keywords: ["giao-khoa", "tham-khao", "giao-duc", "hoc-tap", "luyen-thi", "on-thi", "education", "textbook"] },
  { key: "smile", label: "Thiếu nhi", keywords: ["thieu-nhi", "tre-em", "thieu-nien", "children", "kids"] },
  { key: "sparkles", label: "Truyện tranh", keywords: ["truyen-tranh", "manga", "comic", "light-novel"] },
  { key: "baby", label: "Nuôi dạy con", keywords: ["nuoi-day-con", "lam-cha-me", "me-va-be", "parenting"] },
  { key: "user-round", label: "Tiểu sử – hồi ký", keywords: ["tieu-su", "hoi-ky", "danh-nhan", "chan-dung", "biography", "memoir"] },
  { key: "landmark", label: "Lịch sử", keywords: ["lich-su", "chinh-tri", "quan-su", "history"] },
  { key: "globe", label: "Văn hoá – xã hội", keywords: ["van-hoa", "xa-hoi", "dia-ly", "culture"] },
  { key: "flask-conical", label: "Khoa học", keywords: ["khoa-hoc", "vat-ly", "hoa-hoc", "sinh-hoc", "toan-hoc", "science"] },
  { key: "cpu", label: "Công nghệ", keywords: ["cong-nghe", "lap-trinh", "tin-hoc", "may-tinh", "it", "technology", "programming"] },
  { key: "heart-pulse", label: "Sức khoẻ", keywords: ["suc-khoe", "y-hoc", "y-khoa", "dinh-duong", "health"] },
  { key: "dumbbell", label: "Thể thao", keywords: ["the-thao", "the-duc", "yoga", "sport"] },
  { key: "chef-hat", label: "Nấu ăn", keywords: ["nau-an", "am-thuc", "mon-an", "lam-banh", "cooking"] },
  { key: "plane", label: "Du lịch", keywords: ["du-lich", "travel"] },
  { key: "palette", label: "Nghệ thuật", keywords: ["nghe-thuat", "hoi-hoa", "my-thuat", "thiet-ke", "nhiep-anh", "art", "design"] },
  { key: "music", label: "Âm nhạc", keywords: ["am-nhac", "music"] },
  { key: "flower-2", label: "Tôn giáo – tâm linh", keywords: ["ton-giao", "tam-linh", "phat-giao", "thien", "religion"] },
  { key: "scale", label: "Pháp luật", keywords: ["phap-luat", "luat", "law"] },
  { key: "house", label: "Gia đình – nhà cửa", keywords: ["gia-dinh", "nha-cua", "phong-thuy", "lam-vuon", "home"] },
];

export const DEFAULT_CATEGORY_ICON = CATEGORY_ICONS[0];

const BY_KEY = new Map(CATEGORY_ICONS.map((icon) => [icon.key, icon]));

/** Public URL of an icon's artwork. */
export const categoryIconSrc = (icon) => `/category-icons/${icon.key}.svg`;

/** Lower-case, strip Vietnamese diacritics, hyphenate — like a slug. */
export function toSlugText(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Longest keywords first, so "truyen-tranh" wins over a shorter, looser match.
const KEYWORDS = CATEGORY_ICONS.flatMap((icon) =>
  icon.keywords.map((keyword) => ({ keyword, icon }))
).sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * Guesses an icon from free text (a category name or slug). Keywords match
 * whole hyphen-separated words, so "it" does not fire inside "tieu-thuyet".
 * Returns null when nothing matches.
 */
export function guessCategoryIcon(...texts) {
  const haystack = `-${texts.map(toSlugText).filter(Boolean).join("-")}-`;
  if (haystack === "--") return null;
  const hit = KEYWORDS.find(({ keyword }) => haystack.includes(`-${keyword}-`));
  return hit ? hit.icon : null;
}

/** Looks up an icon by its stored key; null for empty or unknown keys. */
export function categoryIconByKey(key) {
  return (key && BY_KEY.get(key)) || null;
}

/**
 * The icon a category shows: the admin's choice, else a guess from its slug
 * and name, else the generic book.
 */
export function resolveCategoryIcon(category = {}) {
  return (
    categoryIconByKey(category.icon) ||
    guessCategoryIcon(category.slug, category.name) ||
    DEFAULT_CATEGORY_ICON
  );
}

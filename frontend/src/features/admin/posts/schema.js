export const POST_STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Nháp" },
  { value: "published", label: "Đã xuất bản" },
];

export const POST_STATUS_MAP = {
  draft: { label: "Nháp", variant: "secondary" },
  published: { label: "Đã xuất bản", variant: "success" },
};

export function getPostStatusConfig(status) {
  return POST_STATUS_MAP[status] || { label: status, variant: "default" };
}

export function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const EMPTY_POST = {
  title: "",
  slug: "",
  thumbnail: "",
  shortDescription: "",
  content: "",
  category: "",
  status: "draft",
  metaTitle: "",
  metaDescription: "",
  tags: [],
};

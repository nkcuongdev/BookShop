import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Globe,
  EyeOff,
  ImageIcon,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { ImageUploader } from "@/components/admin/common/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  usePost,
  useCreatePost,
  useUpdatePost,
  usePublishPost,
  useUnpublishPost,
  usePostCategories,
} from "@/features/admin/posts/hooks";
import { EMPTY_POST, generateSlug } from "@/features/admin/posts/schema";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

const NO_CATEGORY_VALUE = "__none__";

function postToForm(post) {
  if (!post) return EMPTY_POST;
  return {
    title: post.title || "",
    slug: post.slug || "",
    thumbnail: post.thumbnail || "",
    shortDescription: post.shortDescription || "",
    content: post.content || "",
    category: post.category?._id || post.category || NO_CATEGORY_VALUE,
    status: post.status || "draft",
    metaTitle: post.metaTitle || "",
    metaDescription: post.metaDescription || "",
    tags: post.tags || [],
  };
}

export default function PostFormPage({ mode = "create" }) {
  const { user } = useAuth();
  const canPublish = can(user, "post.publish");
  const canUpload = can(user, "upload.admin");
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = mode === "edit";

  const postQ = usePost(isEdit ? id : null);
  const categoriesQ = usePostCategories();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const publishPost = usePublishPost();
  const unpublishPost = useUnpublishPost();

  const formVersion = isEdit
    ? `${id}:${postQ.data?.updatedAt || "loading"}`
    : "create";
  const initialDraft = {
    version: formVersion,
    form: isEdit ? postToForm(postQ.data) : EMPTY_POST,
    slugManual: isEdit && Boolean(postQ.data),
  };
  const [draft, setDraft] = useState(initialDraft);
  const currentDraft = draft.version === formVersion ? draft : initialDraft;
  const form = currentDraft.form;
  const slugManual = currentDraft.slugManual;
  const setForm = (updater) => {
    setDraft((current) => {
      const base = current.version === formVersion ? current : initialDraft;
      return {
        ...base,
        form: typeof updater === "function" ? updater(base.form) : updater,
      };
    });
  };
  const setSlugManual = (value) => {
    setDraft((current) => {
      const base = current.version === formVersion ? current : initialDraft;
      return { ...base, slugManual: value };
    });
  };
  const [tagInput, setTagInput] = useState("");

  const categories = categoriesQ.data || [];

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !slugManual) {
        next.slug = generateSlug(value);
      }
      return next;
    });
  };

  const handleSlugChange = (value) => {
    setSlugManual(true);
    setForm((prev) => ({ ...prev, slug: value }));
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      category: form.category === NO_CATEGORY_VALUE ? null : form.category || null,
    };

    if (isEdit) {
      await updatePost.mutateAsync({ id, data: payload });
    } else {
      await createPost.mutateAsync(payload);
    }
    navigate("/admin/posts");
  };

  const handlePublish = async () => {
    if (isEdit) {
      await publishPost.mutateAsync(id);
      postQ.refetch();
    }
  };

  const handleUnpublish = async () => {
    if (isEdit) {
      await unpublishPost.mutateAsync(id);
      postQ.refetch();
    }
  };

  const isSaving = createPost.isPending || updatePost.isPending;
  const isLoading = isEdit && postQ.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? "Chỉnh sửa bài viết" : "Thêm bài viết mới"}
        description={isEdit ? form.title : "Tạo bài viết mới cho blog"}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/posts")}>
              <ArrowLeft className="size-4" />
              Quay lại
            </Button>
            {canPublish && isEdit && form.status === "draft" && (
              <Button
                variant="outline"
                onClick={handlePublish}
                loading={publishPost.isPending}
              >
                <Globe className="size-4" />
                Xuất bản
              </Button>
            )}
            {canPublish && isEdit && form.status === "published" && (
              <Button
                variant="outline"
                onClick={handleUnpublish}
                loading={unpublishPost.isPending}
              >
                <EyeOff className="size-4" />
                Hủy xuất bản
              </Button>
            )}
          </div>
        }
      />

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SectionCard title="Nội dung bài viết" icon={FileText}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Tiêu đề <span className="text-danger-strong">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    placeholder="Nhập tiêu đề bài viết"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL)</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="url-bai-viet"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL: /news/{form.slug || "..."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Mô tả ngắn</Label>
                  <Textarea
                    id="shortDescription"
                    value={form.shortDescription}
                    onChange={(e) => handleChange("shortDescription", e.target.value)}
                    placeholder="Mô tả ngắn về bài viết (hiển thị trong danh sách)"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">
                    Nội dung <span className="text-danger-strong">*</span>
                  </Label>
                  <Textarea
                    id="content"
                    value={form.content}
                    onChange={(e) => handleChange("content", e.target.value)}
                    placeholder="Nội dung bài viết (hỗ trợ HTML)"
                    rows={15}
                    className="font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Bạn có thể sử dụng HTML để định dạng nội dung
                  </p>
                </div>
              </div>
            </SectionCard>

          </div>

          <div className="space-y-6">
            <SectionCard title="Xuất bản">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Trạng thái</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => handleChange("status", v)}
                    disabled={!canPublish}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Nháp</SelectItem>
                      <SelectItem value="published">Xuất bản</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Danh mục</Label>
                  <Select
                    value={form.category || NO_CATEGORY_VALUE}
                    onValueChange={(v) => handleChange("category", v)}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Chọn danh mục" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY_VALUE}>Không có danh mục</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c._id || c.id} value={c._id || c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full" loading={isSaving}>
                  <Save className="size-4" />
                  {isSaving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Tạo bài viết"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Ảnh đại diện" icon={ImageIcon}>
              <ImageUploader
                value={form.thumbnail}
                onChange={(value) => handleChange("thumbnail", value)}
                purpose="post"
                ratio="16/9"
                disabled={!canUpload}
              />
            </SectionCard>

            <SectionCard title="Tags">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Thêm tag..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    Thêm
                  </Button>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </form>
    </div>
  );
}

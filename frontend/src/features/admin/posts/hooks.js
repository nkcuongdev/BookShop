import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postsAPI } from "@/services/api";

// Posts hooks
export function usePosts(params = {}) {
  return useQuery({
    queryKey: ["admin", "posts", params],
    queryFn: () => postsAPI.getAll(params).then((r) => r.data),
  });
}

export function usePost(id) {
  return useQuery({
    queryKey: ["admin", "post", id],
    enabled: !!id,
    queryFn: () => postsAPI.getById(id).then((r) => r.data?.post),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => postsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
      toast.success("Đã tạo bài viết");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể tạo bài viết");
    },
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => postsAPI.update(id, data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
      qc.invalidateQueries({ queryKey: ["admin", "post", vars.id] });
      toast.success("Đã lưu thay đổi");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể cập nhật bài viết");
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => postsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
      toast.success("Đã xóa bài viết");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể xóa bài viết");
    },
  });
}

export function usePublishPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => postsAPI.publish(id),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
      qc.invalidateQueries({ queryKey: ["admin", "post", id] });
      toast.success("Đã xuất bản bài viết");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể xuất bản bài viết");
    },
  });
}

export function useUnpublishPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => postsAPI.unpublish(id),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
      qc.invalidateQueries({ queryKey: ["admin", "post", id] });
      toast.success("Đã hủy xuất bản");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể hủy xuất bản");
    },
  });
}

// Post Categories hooks
export function usePostCategories() {
  return useQuery({
    queryKey: ["admin", "postCategories"],
    queryFn: () => postsAPI.getAllCategories().then((r) => r.data?.categories || []),
  });
}

export function useCreatePostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => postsAPI.createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "postCategories"] });
      toast.success("Đã tạo danh mục");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể tạo danh mục");
    },
  });
}

export function useUpdatePostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => postsAPI.updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "postCategories"] });
      toast.success("Đã cập nhật danh mục");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể cập nhật danh mục");
    },
  });
}

export function useDeletePostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => postsAPI.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "postCategories"] });
      toast.success("Đã xóa danh mục");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể xóa danh mục");
    },
  });
}

// Public posts hooks (for frontend pages)
export function usePublishedPosts(params = {}) {
  return useQuery({
    queryKey: ["posts", "published", params],
    queryFn: () => postsAPI.getPublished(params).then((r) => r.data),
  });
}

export function useLatestPosts(limit = 5) {
  return useQuery({
    queryKey: ["posts", "latest", limit],
    queryFn: () => postsAPI.getLatest(limit).then((r) => r.data?.posts || []),
  });
}

export function usePostBySlug(slug) {
  return useQuery({
    queryKey: ["posts", "slug", slug],
    enabled: !!slug,
    queryFn: () => postsAPI.getBySlug(slug).then((r) => r.data),
  });
}

export function usePublicPostCategories() {
  return useQuery({
    queryKey: ["posts", "categories"],
    queryFn: () => postsAPI.getCategories().then((r) => r.data?.categories || []),
  });
}

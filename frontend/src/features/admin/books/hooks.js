import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { booksAPI } from "@/services/api";

export function useBooks(params = {}) {
  return useQuery({
    queryKey: ["admin", "books", params],
    queryFn: () =>
      booksAPI.getAll({ ...params, raw: 1 }).then((r) => r.data?.books || []),
  });
}

export function useBook(id) {
  return useQuery({
    queryKey: ["admin", "book", id],
    enabled: !!id,
    queryFn: () => booksAPI.getById(id, { raw: 1 }).then((r) => r.data?.book),
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => booksAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "books"] });
      toast.success("Đã thêm sách mới");
    },
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => booksAPI.update(id, data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "books"] });
      qc.invalidateQueries({ queryKey: ["admin", "book", vars.id] });
      toast.success("Đã lưu thay đổi");
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => booksAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "books"] });
      toast.success("Đã xoá sách");
    },
  });
}

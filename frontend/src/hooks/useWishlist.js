import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext.jsx";
import { authAPI } from "@/services/api";

const getBookId = (book) => String(book?._id || book?.id || "");

export default function useWishlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = String(user?._id || user?.id || "anonymous");
  const queryKey = ["wishlist", userId];

  const wishlistQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await authAPI.getWishlist();
      return response?.data?.items || [];
    },
    enabled: Boolean(user),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const items = useMemo(
    () => (user ? wishlistQuery.data || [] : []),
    [user, wishlistQuery.data]
  );

  const toggleMutation = useMutation({
    mutationFn: async (book) => {
      const response = await authAPI.toggleWishlist(getBookId(book));
      if (!response?.success) {
        throw new Error(response?.message || "Không thể cập nhật yêu thích");
      }
      return { response, book };
    },
    onMutate: async (book) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || [];
      const bookId = getBookId(book);
      const existed = previous.some((item) => getBookId(item) === bookId);

      queryClient.setQueryData(
        queryKey,
        existed
          ? previous.filter((item) => getBookId(item) !== bookId)
          : [...previous, book]
      );

      return { previous };
    },
    onError: (_error, _book, context) => {
      queryClient.setQueryData(queryKey, context?.previous || []);
    },
    onSuccess: ({ response, book }) => {
      const wished = Boolean(response?.data?.wished);
      const bookId = getBookId(book);
      queryClient.setQueryData(queryKey, (current = []) => {
        const containsBook = current.some((item) => getBookId(item) === bookId);
        if (wished && !containsBook) return [...current, book];
        if (!wished && containsBook) {
          return current.filter((item) => getBookId(item) !== bookId);
        }
        return current;
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const response = await authAPI.clearWishlist();
      if (!response?.success) {
        throw new Error(response?.message || "Không thể xóa danh sách yêu thích");
      }
      return response;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || [];
      queryClient.setQueryData(queryKey, []);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous || []);
    },
  });

  const isWishlisted = useCallback(
    (bookId) => items.some((book) => getBookId(book) === String(bookId)),
    [items]
  );

  const toggle = useCallback(
    async (book) => {
      if (!book) return { success: false, message: "Thiếu thông tin sách" };
      if (!user) return { success: false, requiresAuth: true };

      try {
        const { response } = await toggleMutation.mutateAsync(book);
        return { success: true, wished: Boolean(response?.data?.wished) };
      } catch (error) {
        return {
          success: false,
          message: error?.message || "Không thể cập nhật yêu thích",
        };
      }
    },
    [toggleMutation, user]
  );

  const remove = useCallback(
    async (bookId) => {
      const book = items.find((item) => getBookId(item) === String(bookId));
      if (!book) return { success: true };
      return toggle(book);
    },
    [items, toggle]
  );

  const clear = useCallback(async () => {
    if (!user) return { success: false, requiresAuth: true };
    try {
      await clearMutation.mutateAsync();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error?.message || "Không thể xóa danh sách yêu thích",
      };
    }
  }, [clearMutation, user]);

  return {
    items,
    isWishlisted,
    toggle,
    remove,
    clear,
    isLoading: Boolean(user) && wishlistQuery.isLoading,
  };
}

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatAPI } from "@/services/api";

export function useConversations(params = {}) {
  return useQuery({
    queryKey: ["admin", "conversations", params],
    queryFn: () =>
      chatAPI.getConversations(params).then((r) => ({
        conversations: r.data?.conversations || [],
        pagination: r.data?.pagination || { total: 0, page: 1, totalPages: 1 },
      })),
    placeholderData: (previous) => previous,
    refetchInterval: 8000,
  });
}

export function useMessages(conversationId) {
  return useInfiniteQuery({
    queryKey: ["admin", "messages", conversationId],
    enabled: !!conversationId,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      chatAPI
        .getMessages(conversationId, { limit: 50, before: pageParam || undefined })
        .then((r) => r.data || { messages: [], pageInfo: { hasMore: false } }),
    getNextPageParam: (lastPage) => lastPage.pageInfo?.nextCursor || undefined,
    select: (data) => ({
      ...data,
      messages: [...data.pages]
        .reverse()
        .flatMap((page) => page.messages || []),
    }),
    refetchInterval: 5000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, text }) =>
      chatAPI.sendMessage(conversationId, text),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId) => chatAPI.markRead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
    },
  });
}

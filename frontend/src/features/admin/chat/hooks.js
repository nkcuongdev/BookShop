import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatAPI } from "@/services/api";

export function useConversations() {
  return useQuery({
    queryKey: ["admin", "conversations"],
    queryFn: () =>
      chatAPI.getConversations().then((r) => r.data?.conversations || []),
    refetchInterval: 8000,
  });
}

export function useMessages(conversationId) {
  return useQuery({
    queryKey: ["admin", "messages", conversationId],
    enabled: !!conversationId,
    queryFn: () =>
      chatAPI.getMessages(conversationId).then((r) => r.data?.messages || []),
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

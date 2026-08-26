import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Search, Send, UserRound } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useConversations,
  useMarkRead,
  useMessages,
  useSendMessage,
} from "@/features/admin/chat/hooks";
import { cn } from "@/lib/utils";
import { connectSocket } from "@/services/socket";
import { useQueryClient } from "@tanstack/react-query";
import useDebounce from "@/hooks/useDebounce";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}

export default function ChatSupport() {
  const { user } = useAuth();
  const canWrite = can(user, "chat.write");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const listEndRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const qc = useQueryClient();
  const debouncedSearch = useDebounce(search, 250);

  const convsQ = useConversations({
    page,
    limit: 30,
    search: debouncedSearch || undefined,
  });
  const conversations = convsQ.data?.conversations || [];
  const activeSelectedId = conversations.some((item) => item._id === selectedId)
    ? selectedId
    : conversations[0]?._id || null;
  const msgsQ = useMessages(activeSelectedId);
  const sendMut = useSendMessage();
  const markRead = useMarkRead();

  useEffect(() => {
    if (canWrite && activeSelectedId) markRead.mutate(activeSelectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelectedId, canWrite]);

  useEffect(() => {
    if (!loadingOlderRef.current) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgsQ.data?.messages?.length]);

  useEffect(() => {
    const socket = connectSocket();
    if (activeSelectedId) socket.emit("chat:join", activeSelectedId);
    const onMessage = (payload) => {
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
      if (!payload?.conversationId || payload.conversationId === activeSelectedId) {
        qc.invalidateQueries({ queryKey: ["admin", "messages", activeSelectedId] });
      }
    };
    const onConversation = () => {
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
    };
    socket.on("chat:message", onMessage);
    socket.on("chat:conversation", onConversation);
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:conversation", onConversation);
    };
  }, [qc, activeSelectedId]);

  const filteredConvs = convsQ.data?.conversations || [];

  const selected = conversations.find((c) => c._id === activeSelectedId);
  const messages = msgsQ.data?.messages || [];

  const loadOlderMessages = async () => {
    loadingOlderRef.current = true;
    try {
      await msgsQ.fetchNextPage();
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!canWrite || !text.trim() || !activeSelectedId) return;
    sendMut.mutate({ conversationId: activeSelectedId, text: text.trim() });
    setText("");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Chat hỗ trợ" />

      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-0 overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest lg:grid-cols-[320px_1fr]">
        <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder="Tìm hội thoại..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsQ.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : convsQ.isError ? (
              <ErrorState onRetry={() => convsQ.refetch()} />
            ) : filteredConvs.length === 0 ? (
              <EmptyState icon={MessageSquare} title="Chưa có hội thoại" />
            ) : (
              <>
              <ul>
                {filteredConvs.map((c) => {
                  const isActive = c._id === activeSelectedId;
                  return (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c._id)}
                        className={cn(
                          "flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors",
                          isActive ? "bg-primary-50/60" : "hover:bg-muted"
                        )}
                      >
                        <Avatar className="size-10 shrink-0">
                          <AvatarFallback className="text-sm">
                            {c.customer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-semibold text-foreground">
                              {c.customer.name}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground/70">
                              {timeAgo(c.lastAt)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.lastMessage}
                          </p>
                          {c.needsHuman && (
                            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-warning-strong">
                              <UserRound className="size-3" /> Cần nhân viên hỗ trợ
                            </p>
                          )}
                        </div>
                        {c.unread > 0 && (
                          <span className="mt-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(convsQ.data?.pagination?.totalPages || 1) > 1 && (
                <div className="flex items-center justify-between border-t border-border p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Trước
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page}/{convsQ.data.pagination.totalPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={page >= convsQ.data.pagination.totalPages}
                    onClick={() =>
                      setPage((current) =>
                        Math.min(convsQ.data.pagination.totalPages, current + 1)
                      )
                    }
                  >
                    Sau
                  </Button>
                </div>
              )}
              </>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessageSquare} title="Chọn hội thoại" />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border p-4">
                <Avatar className="size-10">
                  <AvatarFallback>{selected.customer.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">
                    {selected.customer.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected.customer.email}
                  </p>
                  {selected.needsHuman && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warning-strong">
                      <UserRound className="size-3.5" /> Khách đang chờ nhân viên
                    </p>
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-muted/60 p-4">
                {msgsQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-3/4" />
                    ))}
                  </div>
                ) : msgsQ.isError ? (
                  <ErrorState onRetry={() => msgsQ.refetch()} />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="Chưa có tin nhắn"
                    description="Hãy gửi lời chào để bắt đầu cuộc trò chuyện."
                  />
                ) : (
                  <ul className="space-y-3">
                    {msgsQ.hasNextPage && (
                      <li className="flex justify-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={msgsQ.isFetchingNextPage}
                          onClick={loadOlderMessages}
                        >
                          {msgsQ.isFetchingNextPage ? "Đang tải..." : "Tải tin nhắn cũ"}
                        </Button>
                      </li>
                    )}
                    {messages.map((m) => {
                      const isAdmin = m.from === "admin";
                      return (
                        <li
                          key={m._id}
                          className={cn("flex", isAdmin ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-xs",
                              isAdmin
                                ? "rounded-tr-sm bg-primary text-primary-foreground"
                                : "rounded-tl-sm bg-card text-foreground"
                            )}
                          >
                            <p>{m.text}</p>
                            {m.automated && (
                              <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-white/80">
                                <Bot className="size-3" /> Trả lời tự động
                              </p>
                            )}
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                isAdmin ? "text-white/70" : "text-muted-foreground/70"
                              )}
                            >
                              {timeAgo(m.at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                    <div ref={listEndRef} />
                  </ul>
                )}
              </div>

              {canWrite ? (
                <form onSubmit={handleSend} className="border-t border-border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Nhập câu trả lời..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={2000}
                      className="h-10"
                    />
                    <Button
                      type="submit"
                      disabled={!text.trim() || sendMut.isPending}
                      loading={sendMut.isPending}
                    >
                      <Send className="size-4" />
                      Gửi
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="border-t border-border p-3 text-sm text-muted-foreground">
                  Bạn chỉ có quyền xem hội thoại.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

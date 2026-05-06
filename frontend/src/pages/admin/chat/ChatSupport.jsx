import { useEffect, useRef, useState } from "react";
import { MessageSquare, Search, Send } from "lucide-react";
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
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const listEndRef = useRef(null);

  const convsQ = useConversations();
  const msgsQ = useMessages(selectedId);
  const sendMut = useSendMessage();
  const markRead = useMarkRead();

  useEffect(() => {
    if (!selectedId && convsQ.data?.length) {
      setSelectedId(convsQ.data[0]._id);
    }
  }, [convsQ.data, selectedId]);

  useEffect(() => {
    if (selectedId) markRead.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsQ.data?.length]);

  const filteredConvs = (convsQ.data || []).filter((c) =>
    !search ? true : c.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = convsQ.data?.find((c) => c._id === selectedId);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    sendMut.mutate({ conversationId: selectedId, text: text.trim() });
    setText("");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Chat hỗ trợ" />

      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid-cols-[320px,1fr]">
        <aside className="flex min-h-0 flex-col border-b border-gray-100 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
              <Input
                placeholder="Tìm hội thoại..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              <ul>
                {filteredConvs.map((c) => {
                  const isActive = c._id === selectedId;
                  return (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c._id)}
                        className={cn(
                          "flex w-full items-start gap-3 border-b border-gray-100 p-3 text-left transition-colors",
                          isActive ? "bg-primary-50/60" : "hover:bg-gray-50"
                        )}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="text-sm">
                            {c.customer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-semibold text-secondary-800">
                              {c.customer.name}
                            </p>
                            <span className="shrink-0 text-[10px] text-secondary-400">
                              {timeAgo(c.lastAt)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-secondary-500">
                            {c.lastMessage}
                          </p>
                        </div>
                        {c.unread > 0 && (
                          <span className="mt-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[10px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
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
              <header className="flex items-center gap-3 border-b border-gray-100 p-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{selected.customer.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-secondary-900">
                    {selected.customer.name}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {selected.customer.email}
                  </p>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-gray-50/60 p-4">
                {msgsQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-3/4" />
                    ))}
                  </div>
                ) : msgsQ.isError ? (
                  <ErrorState onRetry={() => msgsQ.refetch()} />
                ) : (msgsQ.data || []).length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="Chưa có tin nhắn"
                    description="Hãy gửi lời chào để bắt đầu cuộc trò chuyện."
                  />
                ) : (
                  <ul className="space-y-3">
                    {(msgsQ.data || []).map((m) => {
                      const isAdmin = m.from === "admin";
                      return (
                        <li
                          key={m._id}
                          className={cn("flex", isAdmin ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                              isAdmin
                                ? "rounded-tr-sm bg-primary-500 text-white"
                                : "rounded-tl-sm bg-white text-secondary-800"
                            )}
                          >
                            <p>{m.text}</p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                isAdmin ? "text-white/70" : "text-secondary-400"
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

              <form onSubmit={handleSend} className="border-t border-gray-100 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nhập câu trả lời..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="h-10"
                  />
                  <Button type="submit" disabled={!text.trim() || sendMut.isPending}>
                    <Send className="h-4 w-4" />
                    Gửi
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

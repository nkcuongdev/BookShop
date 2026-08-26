import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Send, X, Phone, Mail, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/context/AuthContext";
import { chatAPI } from "@/services/api";
import { connectSocket } from "@/services/socket";
import { cn } from "@/lib/utils";

const QUICK_FAQS = [
  "Làm sao để theo dõi đơn hàng?",
  "Chính sách đổi trả như thế nào?",
  "Có giao hàng toàn quốc không?",
  "Thanh toán bằng cách nào?",
  "Gặp nhân viên hỗ trợ",
];

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}

export default function ChatSupportWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const listEndRef = useRef(null);

  const chatQ = useQuery({
    queryKey: ["customer", "chat"],
    queryFn: () => chatAPI.getMyChat().then((r) => r.data),
    enabled: !!user && open,
    refetchInterval: open ? 4000 : false,
    refetchIntervalInBackground: false,
  });

  const sendMut = useMutation({
    mutationFn: (value) => chatAPI.sendMyMessage(value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", "chat"] });
    },
    onError: (err) => {
      toast.error(err.message || "Không gửi được tin nhắn");
    },
  });

  const messages = chatQ.data?.messages || [];

  useEffect(() => {
    if (!user || !open) return;
    const socket = connectSocket();
    const conversationId = chatQ.data?.conversation?._id;
    if (conversationId) socket.emit("chat:join", conversationId);
    const onMessage = () => {
      qc.invalidateQueries({ queryKey: ["customer", "chat"] });
    };
    socket.on("chat:message", onMessage);
    return () => {
      socket.off("chat:message", onMessage);
    };
  }, [chatQ.data?.conversation?._id, open, qc, user]);

  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, open]);

  const handleSend = (e) => {
    e?.preventDefault?.();
    const value = text.trim();
    if (!value) return;
    if (!user) {
      toast.error("Vui lòng đăng nhập để trò chuyện với hỗ trợ.");
      return;
    }
    sendMut.mutate(value);
    setText("");
  };

  const handleQuickFaq = (faq) => {
    if (!user) {
      setText(faq);
      toast.error("Vui lòng đăng nhập để gửi tin nhắn.");
      return;
    }
    sendMut.mutate(faq);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Hỗ trợ trực tuyến"
        className={cn(
          "fixed bottom-5 right-5 z-40 size-14 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-primary-glow-lg flex items-center justify-center transition-all hover:scale-110 hover:shadow-modal",
          open && "rotate-90"
        )}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && (
          <span className="absolute top-0 right-0 size-3 bg-success rounded-full ring-2 ring-white animate-pulse" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[360px] max-w-[calc(100vw-2rem)] bg-card rounded-2xl ring-1 ring-foreground/[0.08] shadow-modal overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col max-h-[70vh]">
          <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white p-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <p className="font-semibold">BookShop hỗ trợ</p>
                <p className="text-xs text-white/80 flex items-center gap-1.5">
                  <span className="size-2 bg-success rounded-full animate-pulse" />
                  Trợ lý tự động trả lời ngay
                </p>
              </div>
            </div>
          </div>

          {!user ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-foreground">
                Đăng nhập để trò chuyện với nhân viên hỗ trợ của BookShop.
              </p>
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
              >
                Đăng nhập
              </a>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <a
                  href="tel:19001234"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 text-sm text-foreground"
                >
                  <Phone className="size-4 text-primary" /> 1900 1234
                </a>
                <a
                  href="mailto:hello@bookshop.vn"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 text-sm text-foreground"
                >
                  <Mail className="size-4 text-primary" /> Email
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 bg-muted/60 space-y-3">
                <div className="bg-card border border-border rounded-xl p-3 text-sm text-foreground">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Bot className="size-3.5" /> Trợ lý tự động
                  </div>
                  Xin chào {user.name} 👋 Mình có thể giúp gì cho bạn hôm nay?
                </div>

                {chatQ.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                      Câu hỏi thường gặp
                    </p>
                    <div className="space-y-1.5">
                      {QUICK_FAQS.map((faq) => (
                        <button
                          key={faq}
                          onClick={() => handleQuickFaq(faq)}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                        >
                          {faq}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {messages.map((m) => {
                      const mine = m.from === "customer";
                      return (
                        <li
                          key={m._id}
                          className={cn("flex", mine ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-xs",
                              mine
                                ? "rounded-tr-sm bg-primary text-white"
                                : "rounded-tl-sm bg-card text-foreground border border-border"
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            {m.automated && (
                              <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary">
                                <Bot className="size-3" /> Trả lời tự động
                              </p>
                            )}
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                mine ? "text-white/70" : "text-muted-foreground/70"
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

              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => handleQuickFaq("Gặp nhân viên hỗ trợ")}
                  disabled={sendMut.isPending || chatQ.data?.conversation?.needsHuman}
                  className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  <UserRound className="size-3.5" />
                  {chatQ.data?.conversation?.needsHuman
                    ? "Đã chuyển cho nhân viên"
                    : "Gặp nhân viên"}
                </button>
                <form onSubmit={handleSend} className="flex items-center gap-2">
                  <Input
                    value={text}
                    maxLength={2000}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 h-10"
                    disabled={sendMut.isPending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!text.trim()}
                    loading={sendMut.isPending}
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

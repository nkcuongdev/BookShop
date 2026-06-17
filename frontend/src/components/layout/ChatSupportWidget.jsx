import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, X, Phone, Mail, Loader2 } from "lucide-react";
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
          "fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl",
          open && "rotate-90"
        )}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col max-h-[70vh]">
          <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold">BookShop hỗ trợ</p>
                <p className="text-xs text-white/80 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  Online — phản hồi trong 5 phút
                </p>
              </div>
            </div>
          </div>

          {!user ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-secondary-700">
                Đăng nhập để trò chuyện với nhân viên hỗ trợ của BookShop.
              </p>
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
              >
                Đăng nhập
              </a>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <a
                  href="tel:19001234"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-primary-300 text-sm text-secondary-700"
                >
                  <Phone className="w-4 h-4 text-primary-600" /> 1900 1234
                </a>
                <a
                  href="mailto:hello@bookshop.vn"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-primary-300 text-sm text-secondary-700"
                >
                  <Mail className="w-4 h-4 text-primary-600" /> Email
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/60 space-y-3">
                <div className="bg-white border border-gray-100 rounded-xl p-3 text-sm text-secondary-700">
                  Xin chào {user.name} 👋 Chúng tôi có thể giúp gì cho bạn hôm nay?
                </div>

                {chatQ.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary-400 mb-2">
                      Câu hỏi thường gặp
                    </p>
                    <div className="space-y-1.5">
                      {QUICK_FAQS.map((faq) => (
                        <button
                          key={faq}
                          onClick={() => handleQuickFaq(faq)}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors"
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
                              "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                              mine
                                ? "rounded-tr-sm bg-primary-500 text-white"
                                : "rounded-tl-sm bg-white text-secondary-800 border border-gray-100"
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                mine ? "text-white/70" : "text-secondary-400"
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

              <form
                onSubmit={handleSend}
                className="border-t border-gray-100 p-3 flex items-center gap-2"
              >
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 h-10"
                  disabled={sendMut.isPending}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!text.trim() || sendMut.isPending}
                >
                  {sendMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

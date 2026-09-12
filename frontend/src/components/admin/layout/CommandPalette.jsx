import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { visibleNav } from "./navConfig";
import { useAuth } from "@/context/AuthContext.jsx";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Must come from visibleNav: this jumps straight to `to`, so an entry the
  // user cannot open would be a dead end.
  const allItems = visibleNav(user).flatMap((g) =>
    g.items.map((i) => ({ ...i, group: g.group }))
  );
  const filtered = query
    ? allItems.filter((i) =>
        i.label.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  const go = (to) => {
    navigate(to);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "hidden md:inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground transition-colors min-w-[260px]"
        )}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Tìm kiếm nhanh...</span>
        <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted-foreground/70" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trang, hành động, danh mục..."
              className="border-0 focus:ring-0 shadow-none h-auto px-0"
            />
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Không có kết quả.
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {item.group}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

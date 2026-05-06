import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ADMIN_NAV } from "./navConfig";
import { cn } from "@/lib/utils";

export function CommandPalette() {
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

  const allItems = ADMIN_NAV.flatMap((g) =>
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
          "hidden md:inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-secondary-500 hover:border-gray-300 hover:text-secondary-700 transition-colors min-w-[260px]"
        )}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Tìm kiếm nhanh...</span>
        <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-500">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <Search className="h-4 w-4 text-secondary-400" />
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
              <div className="py-8 text-center text-sm text-secondary-500">
                Không có kết quả.
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <item.icon className="h-4 w-4 text-secondary-500" />
                  <span className="flex-1 font-medium text-secondary-800">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-secondary-400">
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

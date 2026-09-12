import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  User,
  X,
  Heart,
  Bell,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { useCart } from "@/context/CartContext.jsx";
import { useCategories } from "@/context/CategoryContext.jsx";
import { booksAPI, notificationsAPI } from "@/services/api";
import { connectSocket } from "@/services/socket";
import useDebounce from "@/hooks/useDebounce";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import BookCover from "@/components/book/BookCover";

function SearchBox({ onSubmit, autoFocus = false, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState({
    query: "",
    items: [],
  });
  // -1 means "nothing highlighted": Enter then submits the typed query instead
  // of navigating to a suggestion.
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebounce(query, 280);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const requestQuery = debounced.trim();
    if (!requestQuery) return undefined;
    let active = true;
    booksAPI
      .getAll({ search: requestQuery, limit: 6 })
      .then((res) => {
        if (active) {
          setSuggestionResult({ query: requestQuery, items: res?.data?.books || [] });
        }
      })
      .catch(() => {
        if (active) setSuggestionResult({ query: requestQuery, items: [] });
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  const normalizedQuery = debounced.trim();
  const suggestions =
    suggestionResult.query === normalizedQuery ? suggestionResult.items : [];
  const loading = Boolean(normalizedQuery && suggestionResult.query !== normalizedQuery);

  // A new result set invalidates the old highlight position.
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestionResult]);

  // Keep the highlighted row inside the scrollable list.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const option = listRef.current.querySelectorAll("[role='option']")[activeIndex];
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    setOpen(false);
    onSubmit?.(query);
  };

  const handleKeyDown = (event) => {
    const canNavigate = open && suggestions.length > 0;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!canNavigate) {
        if (event.key === "ArrowDown") setOpen(true);
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        // Wrap through -1 so the reader can step back out to their own text.
        if (next < -1) return suggestions.length - 1;
        if (next >= suggestions.length) return -1;
        return next;
      });
      return;
    }

    if (event.key === "Home" && canNavigate) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && canNavigate) {
      event.preventDefault();
      setActiveIndex(suggestions.length - 1);
      return;
    }

    if (event.key === "Enter") {
      if (canNavigate && activeIndex >= 0) {
        const book = suggestions[activeIndex];
        const bookId = book?._id || book?.id;
        if (bookId) {
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          navigate(`/books/${bookId}`);
        }
      }
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const listboxId = "search-suggestions";
  const activeOptionId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <form
      ref={containerRef}
      onSubmit={submit}
      className="relative w-full"
      role="search"
    >
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70" />
        <input
          autoFocus={autoFocus}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open && Boolean(query.trim())}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder || "Tìm sách, tác giả, thể loại..."}
          className="w-full pl-11 pr-10 h-11 rounded-xl border border-border bg-muted focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestionResult({ query: "", items: [] });
              setActiveIndex(-1);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/70 hover:text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-card rounded-xl ring-1 ring-foreground/[0.08] shadow-float overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Đang tìm...
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Không có gợi ý cho "{query}"
            </div>
          )}
          {!loading && suggestions.length > 0 && (
            <>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 bg-muted">
                Gợi ý
              </div>
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label="Gợi ý tìm kiếm"
                className="max-h-80 overflow-y-auto"
              >
                {suggestions.map((book, index) => (
                  <li
                    key={book._id || book.id}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <Link
                      to={`/books/${book._id || book.id}`}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActiveIndex(index)}
                      tabIndex={-1}
                      className={cn(
                        "flex items-center gap-3 p-3 transition-colors",
                        index === activeIndex ? "bg-muted" : "hover:bg-muted"
                      )}
                    >
                      <BookCover
                        src={book.imageUrl}
                        title={book.title}
                        size="sm"
                        className="w-10 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground line-clamp-1">
                          {book.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {book.author}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary shrink-0">
                        {formatVND(book.price)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="submit"
                className="w-full p-3 text-center text-sm font-medium text-primary border-t border-border hover:bg-muted"
              >
                Xem tất cả kết quả cho "{query}"
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

function CategoryMegaMenu({ categories }) {
  if (!categories?.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden lg:inline-flex items-center gap-1.5 h-11 px-3 text-sm font-medium text-foreground hover:text-primary hover:bg-primary-50 rounded-xl transition-colors">
          <LayoutGrid className="size-4" />
          Danh mục
          <ChevronDown className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[560px] p-3">
        <DropdownMenuLabel>Tất cả danh mục</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-2 gap-1 p-1">
          {categories.map((cat) => {
            const slug = cat.slug || cat._id || cat.id;
            return (
              <DropdownMenuItem key={slug} asChild>
                <Link
                  to={`/products?category=${slug}`}
                  className="flex items-center gap-3 rounded-lg"
                >
                  <div className="size-8 rounded-lg bg-primary-50 text-primary flex items-center justify-center shrink-0">
                    <BookOpen className="size-4" />
                  </div>
                  <span className="truncate font-medium">{cat.name}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CartPopover({ items, totalPrice, onOpenCart }) {
  const latest = useMemo(() => items.slice(-3).reverse(), [items]);
  return (
    <PopoverContent align="end" className="w-80 p-0">
      <div className="p-4 border-b border-border">
        <p className="font-semibold text-foreground">Giỏ hàng của bạn</p>
        <p className="text-xs text-muted-foreground">
          {items.length > 0
            ? `${items.length} sản phẩm`
            : "Chưa có sản phẩm nào"}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center">
          <ShoppingCart className="size-10 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Giỏ hàng đang trống</p>
        </div>
      ) : (
        <>
          <ul className="max-h-64 overflow-y-auto divide-y divide-border">
            {latest.map((item) => (
              <li
                key={item.book._id || item.book.id}
                className="flex items-center gap-3 p-3"
              >
                <BookCover
                  src={item.book.imageUrl}
                  title={item.book.title}
                  size="sm"
                  className="w-10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {item.book.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatVND(item.book.price)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="p-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tạm tính</span>
              <span className="font-bold text-primary">
                {formatVND(totalPrice)}
              </span>
            </div>
            <Button asChild className="w-full" onClick={onOpenCart}>
              <Link to="/cart">Xem giỏ hàng</Link>
            </Button>
          </div>
        </>
      )}
    </PopoverContent>
  );
}

function NotificationMenu({ user }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const userId = user?._id || user?.id;

  const load = async () => {
    if (!user) return;
    try {
      const res = await notificationsAPI.getAll(10);
      setItems(res?.data?.notifications || []);
      setUnreadCount(res?.data?.unreadCount || 0);
    } catch {
      setItems([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const loadFromEffect = () => {
      notificationsAPI
        .getAll(10)
        .then((res) => {
          if (!active) return;
          setItems(res?.data?.notifications || []);
          setUnreadCount(res?.data?.unreadCount || 0);
        })
        .catch(() => {
          if (!active) return;
          setItems([]);
          setUnreadCount(0);
        });
    };
    loadFromEffect();
    const socket = connectSocket();
    const onNew = () => loadFromEffect();
    socket.on("notification:new", onNew);
    return () => {
      active = false;
      socket.off("notification:new", onNew);
    };
  }, [userId]);

  if (!user) return null;

  const handleOpen = async (notification) => {
    if (!notification.readAt) {
      await notificationsAPI.markRead(notification._id || notification.id).catch(() => null);
      load();
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleMarkAllRead = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (unreadCount <= 0) return;
    await notificationsAPI.markAllRead().catch(() => null);
    setUnreadCount(0);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        readAt: item.readAt || new Date().toISOString(),
      }))
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2.5 text-muted-foreground hover:text-primary hover:bg-primary-50 rounded-xl transition-colors"
          aria-label="Thong bao"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-danger-strong text-white text-[11px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Thông báo
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-50"
            >
              <CheckCheck className="size-4" />
              Đánh dấu đã xem
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Chưa có thông báo</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto py-1">
            {items.map((item) => (
              <DropdownMenuItem
                key={item._id || item.id}
                onClick={() => handleOpen(item)}
                className="block cursor-pointer whitespace-normal px-4 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      item.readAt ? "bg-transparent" : "bg-primary"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {item.message}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center py-2.5 text-primary">
          <Link to="/profile/notifications" className="font-semibold">
            Xem tất cả thông báo
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Header() {
  const { user, logout } = useAuth();
  const { items, totalItems, totalPrice } = useCart();
  const { categories } = useCategories();
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setBump(true);
    const t = setTimeout(() => setBump(false), 400);
    return () => clearTimeout(t);
  }, [totalItems]);

  const handleSearch = (q) => {
    navigate(`/products?search=${encodeURIComponent(q)}`);
    setMobileSearchOpen(false);
  };

  return (
    <header className="glass-chrome sticky top-0 z-40 border-b border-border shadow-xs">
      <div className="page-container">
        <div className="flex items-center gap-3 h-16 lg:h-18">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="lg:hidden p-2 text-foreground hover:bg-muted rounded-xl">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="p-5 border-b border-border">
                <SheetTitle className="flex items-center gap-2">
                  <div className="size-9 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center">
                    <BookOpen className="size-4 text-white" />
                  </div>
                  BookShop
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-80px)]">
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-primary-50 hover:text-primary"
                >
                  <Sparkles className="size-4" /> Trang chủ
                </Link>
                <Link
                  to="/products"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-primary-50 hover:text-primary"
                >
                  <BookOpen className="size-4" /> Tất cả sách
                </Link>
                <Link
                  to="/news"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-primary-50 hover:text-primary"
                >
                  <BookOpen className="size-4" /> Tin tức
                </Link>
                <Link
                  to="/profile/orders"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-primary-50 hover:text-primary"
                >
                  <Package className="size-4" /> Đơn hàng
                </Link>
                {categories.length > 0 && (
                  <>
                    <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Danh mục
                    </div>
                    {categories.map((cat) => {
                      const slug = cat.slug || cat._id || cat.id;
                      return (
                        <Link
                          key={slug}
                          to={`/products?category=${slug}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted"
                        >
                          {cat.name}
                        </Link>
                      );
                    })}
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="size-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center shadow-primary-glow group-hover:shadow-primary-glow-lg transition-all">
              <BookOpen className="size-5 text-white" />
            </div>
            <span className="text-xl font-display font-bold text-foreground hidden sm:block">
              BookShop
            </span>
          </Link>

          {/* Category mega menu (desktop) */}
          <CategoryMegaMenu categories={categories} />

          {/* News link (desktop) */}
          <Link
            to="/news"
            className="hidden lg:inline-flex items-center gap-1.5 h-11 px-3 text-sm font-medium text-foreground hover:text-primary hover:bg-primary-50 rounded-xl transition-colors"
          >
            Tin tức
          </Link>

          {/* Search (desktop) */}
          <div className="hidden md:block flex-1 max-w-xl">
            <SearchBox onSubmit={handleSearch} />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 lg:gap-2 ml-auto">
            {/* Mobile search trigger */}
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="md:hidden p-2.5 text-muted-foreground hover:bg-muted rounded-xl"
              aria-label="Tìm kiếm"
            >
              <Search className="size-5" />
            </button>

            {/* Wishlist */}
            <Link
              to="/profile/wishlist"
              className="hidden sm:inline-flex p-2.5 text-muted-foreground hover:text-primary hover:bg-primary-50 rounded-xl transition-colors"
              aria-label="Yêu thích"
            >
              <Heart className="size-5" />
            </Link>

            <NotificationMenu user={user} />

            {/* Cart */}
            <Popover open={cartOpen} onOpenChange={setCartOpen}>
              <PopoverTrigger asChild>
                <button
                  onMouseEnter={() => setCartOpen(true)}
                  onMouseLeave={() => setCartOpen(false)}
                  className="relative p-2.5 text-muted-foreground hover:text-primary hover:bg-primary-50 rounded-xl transition-colors"
                  aria-label="Giỏ hàng"
                >
                  <ShoppingCart className="size-5" />
                  {totalItems > 0 && (
                    <span
                      // Cart count changes were completely silent for screen
                      // readers — the app had no aria-live regions at all.
                      aria-live="polite"
                      aria-atomic="true"
                      className={cn(
                        "absolute -top-0.5 -right-0.5 bg-primary text-white text-[11px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-xs",
                        bump && "animate-bounce-subtle"
                      )}
                    >
                      {totalItems > 9 ? "9+" : totalItems}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <div
                onMouseEnter={() => setCartOpen(true)}
                onMouseLeave={() => setCartOpen(false)}
              >
                <CartPopover
                  items={items}
                  totalPrice={totalPrice}
                  onOpenCart={() => setCartOpen(false)}
                />
              </div>
            </Popover>

            {/* Auth */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 p-1 pr-2 lg:pr-3 hover:bg-muted rounded-xl transition-colors">
                    <Avatar className="size-8">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="text-sm">
                        {user.name?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:block text-sm font-medium text-foreground max-w-[100px] truncate">
                      {user.name}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div>
                      <p className="text-sm font-semibold text-foreground normal-case tracking-normal">
                        {user.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-normal mt-0.5 truncate">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="size-4 text-muted-foreground/70" />
                      Hồ sơ cá nhân
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile/orders">
                      <Package className="size-4 text-muted-foreground/70" />
                      Đơn hàng của tôi
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile/points">
                      <Sparkles className="size-4 text-muted-foreground/70" />
                      Điểm thưởng
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile/wishlist">
                      <Heart className="size-4 text-muted-foreground/70" />
                      Yêu thích
                    </Link>
                  </DropdownMenuItem>
                  {can(user, "admin.access") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <Settings className="size-4 text-muted-foreground/70" />
                          {user.role === "admin" ? "Quản trị" : "Khu vực nhân viên"}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                    className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                  >
                    <LogOut className="size-4" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Link to="/login">Đăng nhập</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Đăng ký</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-3 flex items-center gap-2">
          <div className="flex-1">
            <SearchBox onSubmit={handleSearch} autoFocus />
          </div>
          <button
            onClick={() => setMobileSearchOpen(false)}
            className="p-2 text-muted-foreground hover:bg-muted rounded-lg"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </header>
  );
}

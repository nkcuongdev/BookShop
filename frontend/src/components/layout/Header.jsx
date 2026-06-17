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

function SearchBox({ onSubmit, autoFocus = false, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 280);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!debounced.trim()) {
      setSuggestions([]);
      return;
    }
    let active = true;
    setLoading(true);
    booksAPI
      .getAll({ search: debounced, limit: 6 })
      .then((res) => {
        if (active) setSuggestions(res?.data?.books || []);
      })
      .catch(() => active && setSuggestions([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced]);

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

  return (
    <form
      ref={containerRef}
      onSubmit={submit}
      className="relative w-full"
      role="search"
    >
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
        <input
          autoFocus={autoFocus}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder || "Tìm sách, tác giả, thể loại..."}
          className="w-full pl-11 pr-10 h-11 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-secondary-400 hover:text-secondary-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {loading && (
            <div className="p-4 text-center text-sm text-secondary-500">
              Đang tìm...
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="p-4 text-center text-sm text-secondary-500">
              Không có gợi ý cho "{query}"
            </div>
          )}
          {!loading && suggestions.length > 0 && (
            <>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-secondary-400 bg-gray-50">
                Gợi ý
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {suggestions.map((book) => (
                  <li key={book._id || book.id}>
                    <Link
                      to={`/books/${book._id || book.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                    >
                      <img
                        src={book.imageUrl}
                        alt={book.title}
                        className="w-10 h-14 object-cover rounded-lg bg-gray-100 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-secondary-800 line-clamp-1">
                          {book.title}
                        </p>
                        <p className="text-xs text-secondary-500 line-clamp-1">
                          {book.author}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary-600 shrink-0">
                        {formatVND(book.price)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="submit"
                className="w-full p-3 text-center text-sm font-medium text-primary-600 border-t border-gray-100 hover:bg-gray-50"
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
        <button className="hidden lg:inline-flex items-center gap-1.5 h-11 px-3 text-sm font-medium text-secondary-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors">
          <LayoutGrid className="w-4 h-4" />
          Danh mục
          <ChevronDown className="w-3.5 h-3.5" />
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
                  <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
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
      <div className="p-4 border-b border-gray-100">
        <p className="font-semibold text-secondary-800">Giỏ hàng của bạn</p>
        <p className="text-xs text-secondary-500">
          {items.length > 0
            ? `${items.length} sản phẩm`
            : "Chưa có sản phẩm nào"}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center">
          <ShoppingCart className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
          <p className="text-sm text-secondary-500">Giỏ hàng đang trống</p>
        </div>
      ) : (
        <>
          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {latest.map((item) => (
              <li
                key={item.book._id || item.book.id}
                className="flex items-center gap-3 p-3"
              >
                <img
                  src={item.book.imageUrl}
                  alt={item.book.title}
                  className="w-10 h-14 object-cover rounded-md bg-gray-100 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-secondary-800 line-clamp-1">
                    {item.book.title}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {item.quantity} × {formatVND(item.book.price)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary-500">Tạm tính</span>
              <span className="font-bold text-primary-600">
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
    load();
    if (!user) return undefined;
    const socket = connectSocket();
    const onNew = () => load();
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, user?.id]);

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
          className="relative p-2.5 text-secondary-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
          aria-label="Thong bao"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[11px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-md">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-xs font-semibold uppercase tracking-wide text-secondary-500">
            Thông báo
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Đánh dấu đã xem
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="p-4 text-sm text-secondary-500">Chưa có thông báo</div>
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
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.readAt ? "bg-transparent" : "bg-primary-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-secondary-800">
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-secondary-500">
                        {item.message}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
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
    <header className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 h-16 lg:h-18">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="lg:hidden p-2 text-secondary-700 hover:bg-gray-100 rounded-xl">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="p-5 border-b border-gray-100">
                <SheetTitle className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  BookShop
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-80px)]">
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  <Sparkles className="w-4 h-4" /> Trang chủ
                </Link>
                <Link
                  to="/products"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  <BookOpen className="w-4 h-4" /> Tất cả sách
                </Link>
                <Link
                  to="/news"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  <BookOpen className="w-4 h-4" /> Tin tức
                </Link>
                <Link
                  to="/profile/orders"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  <Package className="w-4 h-4" /> Đơn hàng
                </Link>
                {categories.length > 0 && (
                  <>
                    <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary-400">
                      Danh mục
                    </div>
                    {categories.map((cat) => {
                      const slug = cat.slug || cat._id || cat.id;
                      return (
                        <Link
                          key={slug}
                          to={`/products?category=${slug}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-secondary-700 hover:bg-gray-50"
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
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/25 group-hover:shadow-xl group-hover:shadow-primary-500/30 transition-all">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-display font-bold text-secondary-800 hidden sm:block">
              BookShop
            </span>
          </Link>

          {/* Category mega menu (desktop) */}
          <CategoryMegaMenu categories={categories} />

          {/* News link (desktop) */}
          <Link
            to="/news"
            className="hidden lg:inline-flex items-center gap-1.5 h-11 px-3 text-sm font-medium text-secondary-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
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
              className="md:hidden p-2.5 text-secondary-600 hover:bg-gray-100 rounded-xl"
              aria-label="Tìm kiếm"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Wishlist */}
            <Link
              to="/profile/wishlist"
              className="hidden sm:inline-flex p-2.5 text-secondary-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
              aria-label="Yêu thích"
            >
              <Heart className="w-5 h-5" />
            </Link>

            <NotificationMenu user={user} />

            {/* Cart */}
            <Popover open={cartOpen} onOpenChange={setCartOpen}>
              <PopoverTrigger asChild>
                <button
                  onMouseEnter={() => setCartOpen(true)}
                  onMouseLeave={() => setCartOpen(false)}
                  className="relative p-2.5 text-secondary-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                  aria-label="Giỏ hàng"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {totalItems > 0 && (
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 bg-primary-500 text-white text-[11px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-md",
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
                  <button className="flex items-center gap-2 p-1 pr-2 lg:pr-3 hover:bg-gray-100 rounded-xl transition-colors">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="text-sm">
                        {user.name?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:block text-sm font-medium text-secondary-700 max-w-[100px] truncate">
                      {user.name}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div>
                      <p className="text-sm font-semibold text-secondary-800 normal-case tracking-normal">
                        {user.name}
                      </p>
                      <p className="text-xs text-secondary-500 font-normal mt-0.5 truncate">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="w-4 h-4 text-secondary-400" />
                      Hồ sơ cá nhân
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile/orders">
                      <Package className="w-4 h-4 text-secondary-400" />
                      Đơn hàng của tôi
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile/wishlist">
                      <Heart className="w-4 h-4 text-secondary-400" />
                      Yêu thích
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <Settings className="w-4 h-4 text-secondary-400" />
                          Quản trị
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
                    className="text-red-600 focus:bg-red-50 focus:text-red-700"
                  >
                    <LogOut className="w-4 h-4" />
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
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex items-center gap-2">
          <div className="flex-1">
            <SearchBox onSubmit={handleSearch} autoFocus />
          </div>
          <button
            onClick={() => setMobileSearchOpen(false)}
            className="p-2 text-secondary-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </header>
  );
}

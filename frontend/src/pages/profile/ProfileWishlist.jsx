import { Link } from "react-router-dom";
import { Heart, Trash2, ShoppingCart } from "lucide-react";
import useWishlist from "@/hooks/useWishlist";
import { useCart } from "@/context/CartContext.jsx";
import BookCard from "@/components/book/BookCard";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

export default function ProfileWishlist() {
  const { items, clear } = useWishlist();
  const { addItem } = useCart();

  const addAllToCart = () => {
    const added = items.reduce((count, b) => {
      const result = addItem(b, 1);
      return result?.success ? count + 1 : count;
    }, 0);

    if (added > 0) {
      toast.success(`Đã thêm ${added} sản phẩm vào giỏ`);
    } else {
      toast.error("Số lượng trong giỏ đã đạt mức còn hàng");
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Heart}
          title="Chưa có sản phẩm yêu thích"
          description="Nhấn vào biểu tượng trái tim trên các cuốn sách để lưu vào danh sách yêu thích."
          action={
            <Button asChild>
              <Link to="/products">Khám phá sách</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold text-secondary-800">
            Sản phẩm yêu thích
          </h2>
          <p className="text-sm text-secondary-500">
            {items.length} cuốn sách trong danh sách
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addAllToCart} variant="outline">
            <ShoppingCart className="w-4 h-4" />
            Thêm tất cả vào giỏ
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (confirm("Xóa toàn bộ danh sách yêu thích?")) {
                await clear();
                toast.success("Đã xóa danh sách yêu thích");
              }
            }}
            className="text-red-500 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
        {items.map((book) => (
          <BookCard key={book._id || book.id} book={book} />
        ))}
      </div>
    </div>
  );
}

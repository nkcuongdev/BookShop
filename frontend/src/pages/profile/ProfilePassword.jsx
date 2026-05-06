import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { authAPI } from "@/services/api";

export default function ProfilePassword() {
  const [form, setForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.current || !form.next || !form.confirm) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    if (form.next.length < 6) {
      toast.error("Mật khẩu mới cần ít nhất 6 ký tự");
      return;
    }
    if (form.next !== form.confirm) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }
    setLoading(true);

    try {
      const response = await authAPI.changePassword(form.current, form.next);
      toast.success(response?.message || "Đổi mật khẩu thành công");
      setForm({ current: "", next: "", confirm: "" });
    } catch (error) {
      toast.error(error?.message || "Đổi mật khẩu thất bại");
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label) => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <div className="relative mt-1.5">
        <Input
          id={key}
          type={show[key] ? "text" : "password"}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow({ ...show, [key]: !show[key] })}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
        >
          {show[key] ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Card className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-secondary-800">
            Đổi mật khẩu
          </h2>
          <p className="text-sm text-secondary-500">
            Để bảo mật tài khoản, vui lòng không chia sẻ mật khẩu.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {field("current", "Mật khẩu hiện tại")}
        {field("next", "Mật khẩu mới")}
        {field("confirm", "Nhập lại mật khẩu mới")}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        </Button>
      </form>
    </Card>
  );
}

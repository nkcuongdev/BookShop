import { useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, Star, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/useConfirm";
import EmptyState from "@/components/common/EmptyState";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/context/AuthContext.jsx";
import { authAPI } from "@/services/api";
import VietnamAdministrativeFields from "@/components/address/VietnamAdministrativeFields";
import { formatFullAddress } from "@/utils/address";
import Switch from "@/components/ui/switch";

export default function ProfileAddresses() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    label: "Nhà",
    fullName: user?.name || "",
    phone: "",
    address: "",
    city: "",
    district: "",
    ward: "",
    isDefault: false,
  });

  useEffect(() => {
    let active = true;
    authAPI
      .getAddresses()
      .then((res) => {
        if (active && res.success) setAddresses(res?.data?.addresses || []);
      })
      .catch(() => {
        if (active) setAddresses([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () =>
    setForm({
      label: "Nhà",
      fullName: user?.name || "",
      phone: "",
      address: "",
      city: "",
      district: "",
      ward: "",
      isDefault: false,
    });

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (addr) => {
    setEditing(addr._id);
    setForm({
      ...addr,
      city: addr.city || "",
      district: addr.district || "",
      ward: addr.ward || "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.fullName || !form.phone || !form.address) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    const payload = {
      label: form.label,
      fullName: form.fullName,
      phone: form.phone,
      address: form.address,
      city: form.city || "",
      district: form.district || "",
      ward: form.ward || "",
      isDefault: !!form.isDefault,
    };
    const res = editing
      ? await authAPI.updateAddress(editing, payload)
      : await authAPI.addAddress(payload);

    if (!res.success) {
      toast.error(res.message || "Không thể lưu địa chỉ");
      return;
    }

    setAddresses(res?.data?.addresses || []);
    setOpen(false);
    toast.success(editing ? "Đã cập nhật địa chỉ" : "Đã thêm địa chỉ mới");
  };

  const remove = async (id) => {
    const ok = await confirm({
      title: "Xoá địa chỉ này?",
      description: "Địa chỉ sẽ bị xoá khỏi sổ địa chỉ của bạn.",
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await authAPI.deleteAddress(id);
    if (!res.success) {
      toast.error(res.message || "Không thể xóa địa chỉ");
      return;
    }
    setAddresses(res?.data?.addresses || []);
    toast.success("Đã xóa địa chỉ");
  };

  const setDefault = async (id) => {
    const res = await authAPI.setDefaultAddress(id);
    if (!res.success) {
      toast.error(res.message || "Không thể đặt mặc định");
      return;
    }
    setAddresses(res?.data?.addresses || []);
    toast.success("Đã đặt làm địa chỉ mặc định");
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 flex items-center justify-between">
        <div>
          <h2 className="text-h3 font-display font-bold text-foreground">
            Địa chỉ đã lưu
          </h2>
          <p className="text-sm text-muted-foreground">
            {addresses.length} địa chỉ
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Thêm địa chỉ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ mới"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="label">Nhãn</Label>
                  <Input
                    id="label"
                    value={form.label}
                    onChange={(e) =>
                      setForm({ ...form, label: e.target.value })
                    }
                    placeholder="Nhà / Công ty"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Số điện thoại</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="mt-1.5"
                    inputMode="tel"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="fullName">Họ tên người nhận</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm({ ...form, fullName: e.target.value })
                  }
                  className="mt-1.5"
                />
              </div>
              <VietnamAdministrativeFields
                key={editing || "new-address"}
                value={form}
                onChange={setForm}
                idPrefix="profile-administrative"
              />
              <div>
                <Label htmlFor="address">Địa chỉ chi tiết</Label>
                <textarea
                  id="address"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(next) =>
                    setForm({ ...form, isDefault: next })
                  }
                  id="addr-default"
                />
                <label htmlFor="addr-default" className="cursor-pointer text-sm">
                  Đặt làm địa chỉ mặc định
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <Button onClick={submit}>Lưu</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      {addresses.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={MapPin}
            title="Chưa có địa chỉ"
            description="Thêm địa chỉ giao hàng để đặt hàng nhanh hơn lần sau."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <Card key={addr._id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{addr.label}</Badge>
                  {addr.isDefault && (
                    <Badge variant="success">
                      <Star className="size-3 fill-current" />
                      Mặc định
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(addr)}
                    className="size-8"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(addr._id)}
                    className="size-8 text-danger-strong"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="font-semibold text-foreground mt-3">
                {addr.fullName}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Phone className="size-4" />
                {addr.phone}
              </p>
              <p className="text-sm text-muted-foreground flex items-start gap-1.5 mt-1">
                <MapPin className="size-4 mt-0.5 shrink-0" />
                {formatFullAddress(addr)}
              </p>
              {!addr.isDefault && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setDefault(addr._id)}
                  className="mt-2 h-auto p-0"
                >
                  Đặt làm mặc định
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

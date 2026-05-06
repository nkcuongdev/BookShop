import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";

export function useOrders(params = {}) {
  return useQuery({
    queryKey: ["admin", "orders", params],
    queryFn: () => adminAPI.getOrders(params).then((r) => r.data?.orders || []),
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: ["admin", "order", id],
    enabled: !!id,
    queryFn: () => adminAPI.getOrderById(id).then((r) => r.data?.order),
  });
}

// Map 1 action admin -> API call tương ứng.
const ACTION_MAP = {
  confirm: (id) => adminAPI.confirmOrder(id),
  ship: (id) => adminAPI.shipOrder(id),
  deliver: (id) => adminAPI.deliverOrder(id),
  // PAID -> PROCESSING (sau thanh toán online thành công)
  processing: (id) => adminAPI.updateOrderStatus(id, "PROCESSING"),
};

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }) => {
      const fn = ACTION_MAP[action];
      if (!fn) throw new Error(`Unknown order action: ${action}`);
      return fn(id);
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "order", vars.id] });
      toast.success("Đã cập nhật đơn hàng");
    },
    onError: (err) => {
      toast.error(err?.message || "Cập nhật đơn thất bại");
    },
  });
}

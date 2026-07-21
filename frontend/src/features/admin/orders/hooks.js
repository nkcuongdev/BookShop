import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";

export function useOrders(params = {}) {
  return useQuery({
    queryKey: ["admin", "orders", params],
    queryFn: () =>
      adminAPI.getOrders(params).then((r) => ({
        orders: r.data?.orders || [],
        pagination: r.data?.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 },
        statusCounts: r.data?.statusCounts || { all: 0 },
        returnStatusCounts: r.data?.returnStatusCounts || {},
      })),
    placeholderData: (previous) => previous,
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: ["admin", "order", id],
    enabled: !!id,
    queryFn: () => adminAPI.getOrderById(id).then((r) => r.data?.order),
    refetchInterval: 2_000,
  });
}

// Map 1 action admin -> API call tương ứng.
const ACTION_MAP = {
  confirm: (id) => adminAPI.confirmOrder(id),
  cancel: (id, payload) => adminAPI.cancelOrder(id, payload),
  ship: (id, payload) => adminAPI.shipOrder(id, payload),
  deliver: (id) => adminAPI.deliverOrder(id),
  createShipment: (id) => adminAPI.createShipment(id),
  cancelShipment: (id) => adminAPI.cancelShipment(id),
  pauseShipmentSimulation: (id) =>
    adminAPI.controlShipmentSimulation(id, "pause"),
  resumeShipmentSimulation: (id) =>
    adminAPI.controlShipmentSimulation(id, "resume"),
  advanceShipmentSimulation: (id) =>
    adminAPI.controlShipmentSimulation(id, "advance"),
  // PAID -> PROCESSING (sau thanh toán online thành công)
  processing: (id) => adminAPI.updateOrderStatus(id, "PROCESSING"),
};

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, payload }) => {
      const fn = ACTION_MAP[action];
      if (!fn) throw new Error(`Unknown order action: ${action}`);
      return fn(id, payload);
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

export function useReturnRequestAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, adminNote, restock, refundTransactionId }) =>
      adminAPI.resolveReturnRequest(id, {
        status,
        adminNote,
        restock,
        refundTransactionId,
      }),
    onSuccess: (response, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "order", vars.id] });
      toast.success(response?.message || "Đã xử lý yêu cầu đổi trả");
    },
    onError: (error) => {
      toast.error(error?.message || "Không thể xử lý yêu cầu đổi trả");
    },
  });
}

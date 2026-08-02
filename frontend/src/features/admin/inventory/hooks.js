import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  inventoryAPI,
  stockCountsAPI,
  stockIssuesAPI,
  stockReceiptsAPI,
} from "@/services/api";

const INVENTORY_KEY = ["admin", "inventory"];

/**
 * Anything that moves stock invalidates the ledger, the low-stock list, the
 * valuation tiles and the book lists, so they all refresh together.
 */
function invalidateStock(qc) {
  qc.invalidateQueries({ queryKey: INVENTORY_KEY });
  qc.invalidateQueries({ queryKey: ["admin", "books"] });
}

// ── Ledger / reporting ──────────────────────────────────────────

export function useStockLedger(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "ledger", params],
    queryFn: () =>
      inventoryAPI
        .getLedger(params)
        .then((r) => r.data || { entries: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useBookLedger(bookId, params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "ledger", "book", bookId, params],
    queryFn: () => inventoryAPI.getBookLedger(bookId, params).then((r) => r.data),
    enabled: Boolean(bookId),
  });
}

export function useLowStock(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "low-stock", params],
    queryFn: () =>
      inventoryAPI
        .getLowStock(params)
        .then((r) => r.data || { books: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useStockValuation({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "valuation"],
    queryFn: () => inventoryAPI.getValuation().then((r) => r.data),
    enabled,
  });
}

export function useMovementReport(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "report", params],
    queryFn: () => inventoryAPI.getReport(params).then((r) => r.data),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => inventoryAPI.adjust(data),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã điều chỉnh tồn kho");
    },
    onError: (error) => toast.error(error?.message || "Không thể điều chỉnh tồn kho"),
  });
}

// ── Goods receipts ──────────────────────────────────────────────

export function useStockReceipts(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "receipts", params],
    queryFn: () =>
      stockReceiptsAPI
        .getAll(params)
        .then((r) => r.data || { receipts: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useStockReceipt(id) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "receipts", "detail", id],
    queryFn: () => stockReceiptsAPI.getById(id).then((r) => r.data?.receipt),
    enabled: Boolean(id),
  });
}

export function useCreateStockReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockReceiptsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "receipts"] });
      toast.success("Đã tạo phiếu nhập");
    },
    onError: (error) => toast.error(error?.message || "Không thể tạo phiếu nhập"),
  });
}

export function useUpdateStockReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => stockReceiptsAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "receipts"] });
      toast.success("Đã lưu phiếu nhập");
    },
    onError: (error) => toast.error(error?.message || "Không thể lưu phiếu nhập"),
  });
}

export function useConfirmStockReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => stockReceiptsAPI.confirm(id),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã nhập kho, tồn kho và giá vốn đã cập nhật");
    },
    onError: (error) => toast.error(error?.message || "Không thể xác nhận phiếu nhập"),
  });
}

export function useCancelStockReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => stockReceiptsAPI.cancel(id, reason),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã huỷ phiếu nhập");
    },
    onError: (error) => toast.error(error?.message || "Không thể huỷ phiếu nhập"),
  });
}

// ── Goods issues ────────────────────────────────────────────────

export function useStockIssues(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "issues", params],
    queryFn: () =>
      stockIssuesAPI
        .getAll(params)
        .then((r) => r.data || { issues: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useStockIssue(id) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "issues", "detail", id],
    queryFn: () => stockIssuesAPI.getById(id).then((r) => r.data?.issue),
    enabled: Boolean(id),
  });
}

export function useCreateStockIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockIssuesAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "issues"] });
      toast.success("Đã tạo phiếu xuất");
    },
    onError: (error) => toast.error(error?.message || "Không thể tạo phiếu xuất"),
  });
}

export function useUpdateStockIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => stockIssuesAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "issues"] });
      toast.success("Đã lưu phiếu xuất");
    },
    onError: (error) => toast.error(error?.message || "Không thể lưu phiếu xuất"),
  });
}

export function useConfirmStockIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => stockIssuesAPI.confirm(id),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã xuất kho");
    },
    onError: (error) => toast.error(error?.message || "Không thể xác nhận phiếu xuất"),
  });
}

export function useCancelStockIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => stockIssuesAPI.cancel(id, reason),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã huỷ phiếu xuất");
    },
    onError: (error) => toast.error(error?.message || "Không thể huỷ phiếu xuất"),
  });
}

// ── Stocktakes ──────────────────────────────────────────────────

export function useStockCounts(params = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "counts", params],
    queryFn: () =>
      stockCountsAPI
        .getAll(params)
        .then((r) => r.data || { counts: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useStockCount(id) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, "counts", "detail", id],
    queryFn: () => stockCountsAPI.getById(id).then((r) => r.data?.count),
    enabled: Boolean(id),
  });
}

export function useCreateStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockCountsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "counts"] });
      toast.success("Đã tạo phiếu kiểm kho");
    },
    onError: (error) => toast.error(error?.message || "Không thể tạo phiếu kiểm kho"),
  });
}

export function useSaveCountItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }) => stockCountsAPI.saveItems(id, items),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: [...INVENTORY_KEY, "counts", "detail", variables.id],
      });
      toast.success("Đã lưu số đếm");
    },
    onError: (error) => toast.error(error?.message || "Không thể lưu số đếm"),
  });
}

export function useCompleteStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => stockCountsAPI.complete(id),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Đã hoàn tất kiểm kho, tồn kho đã được cập nhật");
    },
    onError: (error) =>
      toast.error(error?.message || "Không thể hoàn tất kiểm kho"),
  });
}

export function useCancelStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => stockCountsAPI.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...INVENTORY_KEY, "counts"] });
      toast.success("Đã huỷ phiếu kiểm kho");
    },
    onError: (error) => toast.error(error?.message || "Không thể huỷ phiếu kiểm kho"),
  });
}

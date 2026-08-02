import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookPicker } from "@/components/admin/inventory/BookPicker";
import { CancelDocumentDialog } from "@/components/admin/inventory/CancelDocumentDialog";
import { useSuppliers } from "@/features/admin/suppliers/hooks";
import {
  useCancelStockReceipt,
  useConfirmStockReceipt,
  useCreateStockReceipt,
  useStockReceipt,
  useUpdateStockReceipt,
} from "@/features/admin/inventory/hooks";
import { receiptTotals } from "@/features/admin/inventory/schema";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateVN, formatVND } from "@/utils/format";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { toast } from "sonner";

const emptyHeader = {
  supplier: "",
  invoiceNumber: "",
  invoiceDate: "",
  receivedAt: new Date().toISOString().slice(0, 10),
  discount: 0,
  shippingFee: 0,
  note: "",
};

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Loads the receipt, then hands it to the form keyed by document id and
 * revision, so the editable state is seeded on mount rather than synced by an
 * effect. Re-keying on updatedAt also discards stale local edits after the
 * server rewrites the document (a confirm or cancel).
 */
export default function StockReceiptForm({ mode = "create" }) {
  const { id } = useParams();
  const isEditMode = mode === "edit";
  const receiptQuery = useStockReceipt(isEditMode ? id : null);

  if (isEditMode && receiptQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <StockReceiptFormBody
      key={receiptQuery.data ? `${id}:${receiptQuery.data.updatedAt}` : "new"}
      mode={mode}
      receipt={receiptQuery.data || null}
    />
  );
}

function StockReceiptFormBody({ mode, receipt }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const isEdit = mode === "edit";
  const suppliersQ = useSuppliers({ status: "active", limit: 100 });

  const createMut = useCreateStockReceipt();
  const updateMut = useUpdateStockReceipt();
  const confirmMut = useConfirmStockReceipt();
  const cancelMut = useCancelStockReceipt();

  const [header, setHeader] = useState(() =>
    receipt
      ? {
          supplier: String(receipt.supplier?._id || receipt.supplier || ""),
          invoiceNumber: receipt.invoiceNumber || "",
          invoiceDate: toDateInput(receipt.invoiceDate),
          receivedAt: toDateInput(receipt.receivedAt),
          discount: receipt.discount || 0,
          shippingFee: receipt.shippingFee || 0,
          note: receipt.note || "",
        }
      : emptyHeader
  );
  const [items, setItems] = useState(() =>
    (receipt?.items || []).map((item) => ({
      book: String(item.book?._id || item.book),
      title: item.title || item.book?.title || "",
      imageUrl: item.book?.imageUrl || "",
      currentStock: item.book?.stock ?? null,
      quantity: item.quantity,
      unitCost: item.unitCost,
      note: item.note || "",
    }))
  );
  const [cancelOpen, setCancelOpen] = useState(false);

  // Two independent reasons to lock the form. A confirmed or cancelled receipt
  // is frozen: it is displayed read-only and corrections go through a reversing
  // document. Separately, `inventory.read` alone opens this page, so an account
  // without `inventory.write` (support, accounting) must not be shown fields and
  // buttons the API is going to reject.
  const canWrite = can(user, "inventory.write");
  const isReadOnly = (isEdit && receipt && receipt.status !== "DRAFT") || !canWrite;

  const totals = useMemo(
    () => receiptTotals(items, header.discount, header.shippingFee),
    [items, header.discount, header.shippingFee]
  );

  const setHeaderField = (field) => (event) =>
    setHeader((current) => ({ ...current, [field]: event.target.value }));

  const addBook = (book) => {
    setItems((current) => [
      ...current,
      {
        book: String(book._id),
        title: book.title,
        imageUrl: book.imageUrl || "",
        currentStock: book.stock ?? 0,
        // Seed with the last purchase price so repeat orders need no retyping.
        quantity: 1,
        unitCost: book.lastPurchasePrice || book.costPrice || 0,
        note: "",
      },
    ]);
  };

  const updateItem = (index, field, value) => {
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (index) => {
    setItems((current) => current.filter((_, position) => position !== index));
  };

  function validate() {
    if (!header.supplier) {
      toast.error("Vui lòng chọn nhà cung cấp");
      return false;
    }
    if (!items.length) {
      toast.error("Phiếu nhập phải có ít nhất một dòng");
      return false;
    }
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        toast.error(`"${item.title}": số lượng phải là số nguyên dương`);
        return false;
      }
      if (Number(item.unitCost) < 0) {
        toast.error(`"${item.title}": giá nhập không được âm`);
        return false;
      }
    }
    if (Number(header.discount) > totals.subtotal) {
      toast.error("Chiết khấu không được vượt quá tiền hàng");
      return false;
    }
    return true;
  }

  function buildPayload() {
    return {
      ...header,
      discount: Number(header.discount) || 0,
      shippingFee: Number(header.shippingFee) || 0,
      items: items.map((item) => ({
        book: item.book,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        note: item.note,
      })),
    };
  }

  const handleSave = async () => {
    if (!validate()) return;
    const payload = buildPayload();
    if (isEdit) {
      await updateMut.mutateAsync({ id, data: payload });
    } else {
      const result = await createMut.mutateAsync(payload);
      const created = result?.data?.receipt;
      if (created?._id) navigate(`/admin/inventory/receipts/${created._id}`);
    }
  };

  const handleConfirm = async () => {
    const ok = await confirm({
      title: "Xác nhận nhập kho?",
      description:
        "Tồn kho và giá vốn bình quân sẽ được cập nhật ngay. Sau khi xác nhận, phiếu không thể sửa — muốn sửa phải huỷ và tạo phiếu mới.",
      confirmText: "Xác nhận nhập kho",
    });
    if (!ok) return;
    // Persist any unsaved edits first so what gets posted is what is on screen.
    if (!isReadOnly) {
      if (!validate()) return;
      await updateMut.mutateAsync({ id, data: buildPayload() });
    }
    await confirmMut.mutateAsync(id);
  };

  const handleCancel = async (reason) => {
    await cancelMut.mutateAsync({ id, reason });
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  const isBusy = isSaving || confirmMut.isPending || cancelMut.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? `Phiếu nhập ${receipt?.code || ""}` : "Tạo phiếu nhập"}
        description={
          isEdit && receipt
            ? `Tạo bởi ${receipt.createdBy?.name || "—"} · ${formatDateVN(receipt.createdAt)}`
            : "Ghi nhận hàng về kho, cập nhật tồn và giá vốn bình quân"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isEdit && receipt && <StatusBadge status={receipt.status} />}
            <Button
              variant="outline"
              onClick={() => navigate("/admin/inventory/receipts")}
            >
              <ArrowLeft className="size-4" />
              Danh sách
            </Button>
            {!isReadOnly && (
              <Button variant="outline" onClick={handleSave} disabled={isBusy}>
                <Save className="size-4" />
                {isSaving ? "Đang lưu..." : "Lưu nháp"}
              </Button>
            )}
            {isEdit && receipt?.status === "DRAFT" && (
              <Button onClick={handleConfirm} disabled={isBusy}>
                <Check className="size-4" />
                Xác nhận nhập kho
              </Button>
            )}
            {isEdit && receipt && receipt.status !== "CANCELLED" && (
              <Button
                variant="outline"
                onClick={() => setCancelOpen(true)}
                disabled={isBusy}
              >
                <Ban className="size-4" />
                Huỷ phiếu
              </Button>
            )}
          </div>
        }
      />

      {isReadOnly && (
        <div className="rounded-xl bg-info-muted px-4 py-3 text-sm text-info-strong">
          {!canWrite
            ? "Tài khoản của bạn chỉ có quyền xem kho, không thể chỉnh sửa hoặc xác nhận phiếu."
            : receipt.status === "CONFIRMED"
            ? `Phiếu đã xác nhận lúc ${formatDateVN(receipt.confirmedAt)} và không thể chỉnh sửa.`
            : receipt.status === "CANCELLED"
              ? `Phiếu đã huỷ${receipt.cancelReason ? `: ${receipt.cancelReason}` : ""}.`
              : "Phiếu đang ở trạng thái nháp."}
        </div>
      )}

      <SectionCard title="Thông tin phiếu">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplier">
              Nhà cung cấp <span className="text-danger-strong">*</span>
            </Label>
            <Select
              value={header.supplier}
              onValueChange={(value) =>
                setHeader((current) => ({ ...current, supplier: value }))
              }
              disabled={isReadOnly}
            >
              <SelectTrigger id="supplier">
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                {(suppliersQ.data?.suppliers || []).map((supplier) => (
                  <SelectItem key={supplier._id} value={String(supplier._id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceNumber">Số hoá đơn</Label>
            <Input
              id="invoiceNumber"
              value={header.invoiceNumber}
              onChange={setHeaderField("invoiceNumber")}
              disabled={isReadOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">Ngày hoá đơn</Label>
            <Input
              id="invoiceDate"
              type="date"
              value={header.invoiceDate}
              onChange={setHeaderField("invoiceDate")}
              disabled={isReadOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receivedAt">Ngày nhận hàng</Label>
            <Input
              id="receivedAt"
              type="date"
              value={header.receivedAt}
              onChange={setHeaderField("receivedAt")}
              disabled={isReadOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount">Chiết khấu (đ)</Label>
            <Input
              id="discount"
              type="number"
              min={0}
              value={header.discount}
              onChange={setHeaderField("discount")}
              disabled={isReadOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shippingFee">Phí vận chuyển (đ)</Label>
            <Input
              id="shippingFee"
              type="number"
              min={0}
              value={header.shippingFee}
              onChange={setHeaderField("shippingFee")}
              disabled={isReadOnly}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Textarea
            id="note"
            rows={2}
            value={header.note}
            onChange={setHeaderField("note")}
            disabled={isReadOnly}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Danh sách hàng nhập"
        description={`${items.length} đầu sách · ${items.reduce(
          (total, item) => total + (Number(item.quantity) || 0),
          0
        )} cuốn`}
      >
        {!isReadOnly && (
          <div className="mb-4">
            <BookPicker
              onSelect={addBook}
              excludeIds={items.map((item) => item.book)}
              placeholder="Thêm sách vào phiếu nhập..."
            />
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có dòng nào. Dùng ô tìm kiếm ở trên để thêm sách.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sách</TableHead>
                  <TableHead className="w-28 text-right">Số lượng</TableHead>
                  <TableHead className="w-40 text-right">Giá nhập</TableHead>
                  <TableHead className="w-36 text-right">Thành tiền</TableHead>
                  {!isReadOnly && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.book}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="size-9 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-1">
                            {item.title}
                          </p>
                          {item.currentStock !== null && (
                            <p className="text-xs text-muted-foreground">
                              Tồn hiện tại: {item.currentStock}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {isReadOnly ? (
                        <span className="tabular-nums">{item.quantity}</span>
                      ) : (
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(index, "quantity", event.target.value)
                          }
                          className="h-9 text-right"
                          aria-label={`Số lượng ${item.title}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isReadOnly ? (
                        <span className="tabular-nums">
                          {formatVND(item.unitCost)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          value={item.unitCost}
                          onChange={(event) =>
                            updateItem(index, "unitCost", event.target.value)
                          }
                          className="h-9 text-right"
                          aria-label={`Giá nhập ${item.title}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatVND(
                        (Number(item.quantity) || 0) * (Number(item.unitCost) || 0)
                      )}
                    </TableCell>
                    {!isReadOnly && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-danger-strong"
                          onClick={() => removeItem(index)}
                          aria-label={`Xoá ${item.title}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tiền hàng</dt>
              <dd className="tabular-nums">{formatVND(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Chiết khấu</dt>
              <dd className="tabular-nums">
                −{formatVND(Number(header.discount) || 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Phí vận chuyển</dt>
              <dd className="tabular-nums">
                {formatVND(Number(header.shippingFee) || 0)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold">
              <dt>Tổng cộng</dt>
              <dd className="tabular-nums text-primary">
                {formatVND(totals.totalAmount)}
              </dd>
            </div>
          </dl>
        </div>
      </SectionCard>

      <CancelDocumentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        title="Huỷ phiếu nhập?"
        description={
          receipt?.status === "CONFIRMED"
            ? "Phiếu đã xác nhận. Hệ thống sẽ ghi bút toán ngược để trừ lại số hàng đã nhập."
            : "Phiếu nháp sẽ được đánh dấu là đã huỷ."
        }
        reasonRequired={receipt?.status === "CONFIRMED"}
        isPending={cancelMut.isPending}
      />
    </div>
  );
}

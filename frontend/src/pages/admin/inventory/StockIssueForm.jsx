import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { toast } from "sonner";
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
  useCancelStockIssue,
  useConfirmStockIssue,
  useCreateStockIssue,
  useStockIssue,
  useUpdateStockIssue,
} from "@/features/admin/inventory/hooks";
import { ISSUE_TYPES } from "@/features/admin/inventory/constants";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateVN, formatVND } from "@/utils/format";

const emptyHeader = {
  type: "DAMAGED",
  reason: "",
  supplier: "",
  issuedAt: new Date().toISOString().slice(0, 10),
  note: "",
};

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** See StockReceiptForm: the body is keyed so state seeds on mount. */
export default function StockIssueForm({ mode = "create" }) {
  const { id } = useParams();
  const isEditMode = mode === "edit";
  const issueQuery = useStockIssue(isEditMode ? id : null);

  if (isEditMode && issueQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <StockIssueFormBody
      key={issueQuery.data ? `${id}:${issueQuery.data.updatedAt}` : "new"}
      mode={mode}
      issue={issueQuery.data || null}
    />
  );
}

function StockIssueFormBody({ mode, issue }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const isEdit = mode === "edit";
  const suppliersQ = useSuppliers({ status: "active", limit: 100 });

  const createMut = useCreateStockIssue();
  const updateMut = useUpdateStockIssue();
  const confirmMut = useConfirmStockIssue();
  const cancelMut = useCancelStockIssue();

  const [header, setHeader] = useState(() =>
    issue
      ? {
          type: issue.type,
          reason: issue.reason || "",
          supplier: String(issue.supplier?._id || issue.supplier || ""),
          issuedAt: toDateInput(issue.issuedAt),
          note: issue.note || "",
        }
      : emptyHeader
  );
  const [items, setItems] = useState(() =>
    (issue?.items || []).map((item) => ({
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

  // Frozen once confirmed/cancelled, and always read-only for an account that
  // can open the warehouse but not write to it (`inventory.read` without
  // `inventory.write`).
  const canWrite = can(user, "inventory.write");
  const isReadOnly = (isEdit && issue && issue.status !== "DRAFT") || !canWrite;
  const needsSupplier = header.type === "RETURN_SUPPLIER";

  const totalUnits = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
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
        quantity: 1,
        unitCost: book.costPrice || 0,
        note: "",
      },
    ]);
  };

  const updateItem = (index, field, value) =>
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, [field]: value } : item
      )
    );

  const removeItem = (index) =>
    setItems((current) => current.filter((_, position) => position !== index));

  function validate() {
    if (!header.reason.trim()) {
      toast.error("Vui lòng nhập lý do xuất kho");
      return false;
    }
    if (needsSupplier && !header.supplier) {
      toast.error("Trả hàng nhà cung cấp cần chọn nhà cung cấp");
      return false;
    }
    if (!items.length) {
      toast.error("Phiếu xuất phải có ít nhất một dòng");
      return false;
    }
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        toast.error(`"${item.title}": số lượng phải là số nguyên dương`);
        return false;
      }
      // Warn early; the server still enforces this atomically at confirmation.
      if (item.currentStock !== null && quantity > item.currentStock) {
        toast.error(
          `"${item.title}": chỉ còn ${item.currentStock} cuốn trong kho`
        );
        return false;
      }
    }
    return true;
  }

  function buildPayload() {
    return {
      ...header,
      supplier: needsSupplier ? header.supplier : "",
      items: items.map((item) => ({
        book: item.book,
        quantity: Number(item.quantity),
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
      const created = result?.data?.issue;
      if (created?._id) navigate(`/admin/inventory/issues/${created._id}`);
    }
  };

  const handleConfirm = async () => {
    const ok = await confirm({
      title: "Xác nhận xuất kho?",
      description:
        "Tồn kho sẽ bị trừ ngay và giá trị hàng xuất được tính theo giá vốn hiện tại. Sau khi xác nhận, phiếu không thể sửa.",
      confirmText: "Xác nhận xuất kho",
    });
    if (!ok) return;
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
        title={isEdit ? `Phiếu xuất ${issue?.code || ""}` : "Tạo phiếu xuất"}
        description={
          isEdit && issue
            ? `Tạo bởi ${issue.createdBy?.name || "—"} · ${formatDateVN(issue.createdAt)}`
            : "Ghi nhận hàng rời kho không qua đơn bán: hư hỏng, tặng, trả nhà cung cấp"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isEdit && issue && <StatusBadge status={issue.status} />}
            <Button
              variant="outline"
              onClick={() => navigate("/admin/inventory/issues")}
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
            {isEdit && issue?.status === "DRAFT" && (
              <Button onClick={handleConfirm} disabled={isBusy}>
                <Check className="size-4" />
                Xác nhận xuất kho
              </Button>
            )}
            {isEdit && issue && issue.status !== "CANCELLED" && (
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
            : issue.status === "CONFIRMED"
            ? `Phiếu đã xác nhận lúc ${formatDateVN(issue.confirmedAt)}. Giá trị hàng xuất: ${formatVND(issue.totalCost)}.`
            : issue.status === "CANCELLED"
              ? `Phiếu đã huỷ${issue.cancelReason ? `: ${issue.cancelReason}` : ""}.`
              : "Phiếu đang ở trạng thái nháp."}
        </div>
      )}

      <SectionCard title="Thông tin phiếu">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="type">
              Loại xuất <span className="text-danger-strong">*</span>
            </Label>
            <Select
              value={header.type}
              onValueChange={(value) =>
                setHeader((current) => ({ ...current, type: value }))
              }
              disabled={isReadOnly}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSupplier && (
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
          )}
          <div className="space-y-1.5">
            <Label htmlFor="issuedAt">Ngày xuất</Label>
            <Input
              id="issuedAt"
              type="date"
              value={header.issuedAt}
              onChange={setHeaderField("issuedAt")}
              disabled={isReadOnly}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="reason">
            Lý do xuất kho <span className="text-danger-strong">*</span>
          </Label>
          <Textarea
            id="reason"
            rows={2}
            value={header.reason}
            onChange={setHeaderField("reason")}
            placeholder="Ví dụ: sách bị ẩm mốc do thấm nước kho tầng 1"
            disabled={isReadOnly}
          />
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
        title="Danh sách hàng xuất"
        description={`${items.length} đầu sách · ${totalUnits} cuốn`}
      >
        {!isReadOnly && (
          <div className="mb-4">
            <BookPicker
              onSelect={addBook}
              excludeIds={items.map((item) => item.book)}
              placeholder="Thêm sách vào phiếu xuất..."
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
                  <TableHead className="w-36 text-right">Giá vốn</TableHead>
                  <TableHead className="w-36 text-right">Giá trị</TableHead>
                  {!isReadOnly && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const exceedsStock =
                    item.currentStock !== null &&
                    Number(item.quantity) > item.currentStock;
                  return (
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
                              <p
                                className={
                                  exceedsStock
                                    ? "text-xs font-medium text-danger-strong"
                                    : "text-xs text-muted-foreground"
                                }
                              >
                                Tồn hiện tại: {item.currentStock}
                                {exceedsStock ? " — vượt quá tồn kho" : ""}
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
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {item.unitCost > 0 ? formatVND(item.unitCost) : "chưa có"}
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Giá trị hàng xuất được chốt theo giá vốn tại thời điểm xác nhận phiếu.
        </p>
      </SectionCard>

      <CancelDocumentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        title="Huỷ phiếu xuất?"
        description={
          issue?.status === "CONFIRMED"
            ? "Phiếu đã xác nhận. Hệ thống sẽ ghi bút toán ngược để trả lại số hàng đã xuất."
            : "Phiếu nháp sẽ được đánh dấu là đã huỷ."
        }
        reasonRequired={issue?.status === "CONFIRMED"}
        isPending={cancelMut.isPending}
      />
    </div>
  );
}

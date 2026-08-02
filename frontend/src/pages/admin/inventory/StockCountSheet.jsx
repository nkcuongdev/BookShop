import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCheck, Download, Save, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { StatCard } from "@/components/admin/common/StatCard";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelDocumentDialog } from "@/components/admin/inventory/CancelDocumentDialog";
import {
  useCancelStockCount,
  useCompleteStockCount,
  useSaveCountItems,
  useStockCount,
} from "@/features/admin/inventory/hooks";
import { stockCountsAPI } from "@/services/api";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateVN, formatVND } from "@/utils/format";
import { cn } from "@/lib/utils";

/** Only lines with a value entered count as counted; "" means not yet counted. */
function parseCounted(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Builds the initial draft map: raw input strings keyed by book id. */
function initialDrafts(count) {
  const drafts = {};
  for (const item of count?.items || []) {
    const key = String(item.book?._id || item.book);
    drafts[key] =
      item.countedQty === null || item.countedQty === undefined
        ? ""
        : String(item.countedQty);
  }
  return drafts;
}

/**
 * Loads the stocktake, then hands it to the sheet keyed by id and revision so
 * the draft map is seeded on mount rather than synced by an effect. Re-keying
 * on updatedAt also refreshes the sheet after a save or completion.
 */
export default function StockCountSheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const countQ = useStockCount(id);

  if (countQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!countQ.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Không tìm thấy phiếu kiểm kho" />
        <Button variant="outline" onClick={() => navigate("/admin/inventory/counts")}>
          <ArrowLeft className="size-4" />
          Về danh sách
        </Button>
      </div>
    );
  }

  return (
    <StockCountSheetBody
      key={`${id}:${countQ.data.updatedAt}`}
      count={countQ.data}
    />
  );
}

function StockCountSheetBody({ count }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const saveMut = useSaveCountItems();
  const completeMut = useCompleteStockCount();
  const cancelMut = useCancelStockCount();

  // Keyed by book id; holds raw input strings so a half-typed value is not
  // coerced to 0 while the user is still typing.
  const [drafts, setDrafts] = useState(() => initialDrafts(count));
  const [search, setSearch] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // An open sheet is only editable by someone who may actually write to the
  // warehouse; `inventory.read` is enough to view and export it.
  const canWrite = can(user, "inventory.write");
  const isEditable =
    canWrite && ["DRAFT", "COUNTING"].includes(count.status);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (count.items || [])
      .map((item) => {
        const key = String(item.book?._id || item.book);
        const counted = parseCounted(drafts[key]);
        return {
          key,
          title: item.title || item.book?.title || "",
          imageUrl: item.book?.imageUrl || "",
          systemQty: item.systemQty,
          reservedQty: Number(item.reservedQty) || 0,
          // Copies held for unshipped orders are already out of the sellable
          // figure but still sit on the shelf, so this is what the counter
          // should physically find.
          expectedQty: item.systemQty + (Number(item.reservedQty) || 0),
          unitCost: item.unitCost,
          raw: drafts[key] ?? "",
          counted,
          difference:
            counted === null
              ? null
              : counted - (item.systemQty + (Number(item.reservedQty) || 0)),
        };
      })
      .filter((row) => {
        if (term && !row.title.toLowerCase().includes(term)) return false;
        if (onlyDiff && (row.difference === null || row.difference === 0)) return false;
        return true;
      });
  }, [count, drafts, search, onlyDiff]);

  const summary = useMemo(() => {
    let counted = 0;
    let diffLines = 0;
    let netUnits = 0;
    let netValue = 0;
    for (const item of count.items || []) {
      const key = String(item.book?._id || item.book);
      const value = parseCounted(drafts[key]);
      if (value === null) continue;
      counted += 1;
      const difference =
        value - (item.systemQty + (Number(item.reservedQty) || 0));
      if (difference !== 0) {
        diffLines += 1;
        netUnits += difference;
        netValue += difference * (Number(item.unitCost) || 0);
      }
    }
    return { counted, diffLines, netUnits, netValue: Math.round(netValue) };
  }, [count, drafts]);

  const buildItemsPayload = () =>
    (count.items || []).map((item) => {
      const key = String(item.book?._id || item.book);
      return { book: key, countedQty: parseCounted(drafts[key]) };
    });

  const handleSave = async () => {
    await saveMut.mutateAsync({ id, items: buildItemsPayload() });
  };

  const handleComplete = async () => {
    if (summary.counted === 0) {
      toast.error("Chưa nhập số đếm cho dòng nào");
      return;
    }
    const uncounted = (count.items || []).length - summary.counted;
    const ok = await confirm({
      title: "Hoàn tất kiểm kho?",
      description: `${summary.diffLines} dòng lệch sẽ được điều chỉnh về số đếm thực tế.${
        uncounted > 0
          ? ` ${uncounted} dòng chưa đếm sẽ được giữ nguyên tồn hiện tại.`
          : ""
      } Thao tác này không thể hoàn tác.`,
      confirmText: "Hoàn tất kiểm kho",
    });
    if (!ok) return;
    // Persist the sheet first so the server applies exactly what is on screen.
    await saveMut.mutateAsync({ id, items: buildItemsPayload() });
    await completeMut.mutateAsync(id);
  };

  const handleCancel = async (reason) => {
    await cancelMut.mutateAsync({ id, reason });
  };

  const handleExport = async () => {
    try {
      const { blob, filename } = await stockCountsAPI.exportCsv(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || `${count.code}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.message || "Không thể tải phiếu kiểm kho");
    }
  };

  const isBusy = saveMut.isPending || completeMut.isPending || cancelMut.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Kiểm kho ${count.code}`}
        description={`${
          count.scope === "ALL" ? "Toàn bộ kho" : `Danh mục: ${count.scopeValue}`
        } · ${count.items?.length || 0} dòng · Tạo ${formatDateVN(count.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={count.status} />
            <Button
              variant="outline"
              onClick={() => navigate("/admin/inventory/counts")}
            >
              <ArrowLeft className="size-4" />
              Danh sách
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Xuất CSV
            </Button>
            {isEditable && (
              <>
                <Button variant="outline" onClick={handleSave} disabled={isBusy}>
                  <Save className="size-4" />
                  {saveMut.isPending ? "Đang lưu..." : "Lưu số đếm"}
                </Button>
                <Button onClick={handleComplete} disabled={isBusy}>
                  <CheckCheck className="size-4" />
                  Hoàn tất
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCancelOpen(true)}
                  disabled={isBusy}
                >
                  <Ban className="size-4" />
                  Huỷ phiếu
                </Button>
              </>
            )}
          </div>
        }
      />

      {count.status === "COMPLETED" && (
        <div className="rounded-xl bg-success-muted px-4 py-3 text-sm text-success-strong">
          Đã hoàn tất lúc {formatDateVN(count.completedAt)} bởi{" "}
          {count.completedBy?.name || "—"}. Tồn kho đã được điều chỉnh theo số đếm.
        </div>
      )}
      {count.status === "CANCELLED" && (
        <div className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Phiếu đã huỷ{count.cancelReason ? `: ${count.cancelReason}` : ""}.
        </div>
      )}
      {!canWrite && ["DRAFT", "COUNTING"].includes(count.status) && (
        <div className="rounded-xl bg-info-muted px-4 py-3 text-sm text-info-strong">
          Tài khoản của bạn chỉ có quyền xem kho. Bạn vẫn có thể xem và xuất CSV
          phiếu kiểm, nhưng không thể nhập số đếm hoặc hoàn tất phiếu.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Đã đếm"
          value={`${summary.counted}/${count.items?.length || 0}`}
          accent="blue"
          footer="dòng"
        />
        <StatCard
          title="Số dòng lệch"
          value={summary.diffLines}
          accent={summary.diffLines > 0 ? "amber" : "green"}
        />
        <StatCard
          title="Chênh lệch số lượng"
          value={`${summary.netUnits > 0 ? "+" : ""}${summary.netUnits}`}
          accent={summary.netUnits < 0 ? "rose" : "green"}
          footer="cuốn"
        />
        <StatCard
          title="Chênh lệch giá trị"
          value={formatVND(Math.abs(summary.netValue))}
          accent={summary.netValue < 0 ? "rose" : "green"}
          footer={summary.netValue < 0 ? "thiếu hụt" : "dư thừa"}
        />
      </div>

      <SectionCard
        title="Bảng kiểm kho"
        description="Bỏ trống ô số đếm nếu chưa kiểm dòng đó"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder="Lọc theo tên sách..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-56 pl-8"
              />
            </div>
            <Button
              type="button"
              variant={onlyDiff ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyDiff((current) => !current)}
            >
              Chỉ dòng lệch
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="max-h-[32rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Sách</TableHead>
                <TableHead className="w-28 text-right">Tồn có thể bán</TableHead>
                <TableHead className="w-28 text-right">Đang giữ cho đơn</TableHead>
                <TableHead className="w-28 text-right">Tồn kho dự kiến</TableHead>
                <TableHead className="w-32 text-right">Đếm thực tế</TableHead>
                <TableHead className="w-28 text-right">Chênh lệch</TableHead>
                <TableHead className="w-36 text-right">Giá trị lệch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Không có dòng nào khớp bộ lọc
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {row.imageUrl && (
                        <img
                          src={row.imageUrl}
                          alt=""
                          className="size-9 rounded object-cover"
                        />
                      )}
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {row.title}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.systemQty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.reservedQty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-foreground">
                    {row.expectedQty}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditable ? (
                      <Input
                        type="number"
                        min={0}
                        value={row.raw}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.key]: event.target.value,
                          }))
                        }
                        className="h-9 text-right"
                        aria-label={`Số đếm ${row.title}`}
                      />
                    ) : (
                      <span className="tabular-nums">
                        {row.counted === null ? "—" : row.counted}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      row.difference === null || row.difference === 0
                        ? "text-muted-foreground"
                        : row.difference < 0
                          ? "text-danger-strong"
                          : "text-success-strong"
                    )}
                  >
                    {row.difference === null
                      ? "—"
                      : `${row.difference > 0 ? "+" : ""}${row.difference}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.difference === null || row.difference === 0
                      ? "—"
                      : formatVND(Math.abs(row.difference * (row.unitCost || 0)))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <CancelDocumentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        title="Huỷ phiếu kiểm kho?"
        description="Phiếu chưa hoàn tất nên tồn kho không bị ảnh hưởng."
        isPending={cancelMut.isPending}
      />
    </div>
  );
}

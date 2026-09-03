import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Coins,
  Download,
  Percent,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { StatCard } from "@/components/admin/common/StatCard";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { ProfitAreaChart } from "@/components/admin/charts/ProfitAreaChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfitReport } from "@/features/admin/reports/hooks";
import { reportsAPI } from "@/services/api";
import { formatVND } from "@/utils/format";

const GROUP_OPTIONS = [
  { value: "day", label: "Theo ngày" },
  { value: "book", label: "Theo sách" },
  { value: "category", label: "Theo danh mục" },
];

const GROUP_COLUMN_HEADER = {
  day: "Ngày",
  book: "Sách",
  category: "Danh mục",
};

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function MoneyCell({ value, tone = "default" }) {
  const toneClass =
    tone === "profit"
      ? value >= 0
        ? "text-success-strong"
        : "text-danger-strong"
      : "text-foreground";
  return (
    <span className={`tabular-nums font-medium ${toneClass}`}>
      {formatVND(value)}
    </span>
  );
}

export default function ProfitReport() {
  const [groupBy, setGroupBy] = useState("day");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(() => ({ groupBy, from, to }), [groupBy, from, to]);
  const reportQ = useProfitReport(filters);

  const rows = useMemo(() => reportQ.data?.rows || [], [reportQ.data]);
  const totals = reportQ.data?.totals;
  const coverage = reportQ.data?.costCoverage;

  // Only the day grouping is a time series; the others are rankings, where an
  // area chart over an arbitrary ordering would be meaningless.
  const chartData = useMemo(
    () =>
      groupBy === "day"
        ? rows.map((row) => ({
            label: row.label.slice(5),
            revenue: row.revenue,
            cost: row.cost,
            grossProfit: row.grossProfit,
            margin: row.margin,
          }))
        : [],
    [groupBy, rows]
  );

  const exportCsv = async () => {
    if (from && to && from > to) {
      toast.error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await reportsAPI.exportProfit(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất báo cáo lợi nhuận");
    } catch (error) {
      toast.error(error.message || "Không thể xuất báo cáo lợi nhuận");
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      accessorKey: "label",
      header: GROUP_COLUMN_HEADER[groupBy] || "Nhóm",
      cell: ({ row }) => (
        <span className="line-clamp-1 text-sm font-medium text-foreground">
          {row.original.label}
        </span>
      ),
    },
    {
      accessorKey: "revenue",
      header: "Doanh thu",
      cell: ({ row }) => <MoneyCell value={row.original.revenue} />,
    },
    {
      accessorKey: "cost",
      header: "Giá vốn",
      cell: ({ row }) => <MoneyCell value={row.original.cost} />,
    },
    {
      accessorKey: "grossProfit",
      header: "Lợi nhuận gộp",
      cell: ({ row }) => (
        <MoneyCell value={row.original.grossProfit} tone="profit" />
      ),
    },
    {
      accessorKey: "margin",
      header: "Biên LN",
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {row.original.margin}%
        </span>
      ),
    },
    {
      accessorKey: "units",
      header: "Số lượng",
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {row.original.units}
        </span>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <Select
        value={groupBy}
        onValueChange={setGroupBy}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUP_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label htmlFor="profit-from" className="text-xs text-muted-foreground">
          Từ
        </Label>
        <Input
          id="profit-from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="h-9 w-40"
        />
        <Label htmlFor="profit-to" className="text-xs text-muted-foreground">
          Đến
        </Label>
        <Input
          id="profit-to"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="h-9 w-40"
        />
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo lợi nhuận"
        description="Doanh thu và giá vốn của các đơn đã giao, đã trừ hàng trả lại"
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Đang xuất..." : "Xuất CSV"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Doanh thu"
          value={formatVND(totals?.revenue || 0)}
          icon={Wallet}
          accent="blue"
          footer={`${totals?.orderCount || 0} đơn đã giao`}
        />
        <StatCard
          title="Giá vốn"
          value={formatVND(totals?.cost || 0)}
          icon={Coins}
          accent="amber"
          footer={`${totals?.units || 0} sản phẩm`}
        />
        <StatCard
          title="Lợi nhuận gộp"
          value={formatVND(totals?.grossProfit || 0)}
          icon={TrendingUp}
          accent="green"
          // netProfit cũng đã trừ hoàn hỗ trợ và đảo lại phí ship/giảm giá của
          // các đơn hoàn toàn bộ, nên nhãn cũ "sau giảm giá & ship" không còn
          // mô tả đủ.
          footer={`Lợi nhuận ròng: ${formatVND(totals?.netProfit || 0)}`}
        />
        <StatCard
          title="Biên lợi nhuận"
          value={`${totals?.margin || 0}%`}
          icon={Percent}
          accent="violet"
          footer={
            totals?.returnedRevenue
              ? `Đã trừ ${formatVND(totals.returnedRevenue)} trả hàng${
                  totals?.damagedCost
                    ? `, ${formatVND(totals.damagedCost)} hàng trả hỏng`
                    : ""
                }`
              : "Chưa có hàng trả lại"
          }
        />
      </div>

      {coverage?.itemsMissingCost > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-muted px-5 py-4 text-sm text-warning-strong ring-1 ring-warning-strong/15">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {coverage.itemsMissingCost}/{coverage.itemsTotal} dòng hàng chưa có
            giá vốn ({formatVND(coverage.revenueMissingCost)} doanh thu), nên lợi
            nhuận đang bị tính cao hơn thực tế. Chạy{" "}
            <code className="rounded bg-card/60 px-1 py-0.5 text-xs">
              npm run backfill:order-cost
            </code>{" "}
            để bổ sung giá vốn cho các đơn cũ.
          </p>
        </div>
      )}

      {groupBy === "day" && (
        <SectionCard
          title="Diễn biến theo ngày"
          description="Khoảng cách giữa hai đường là lợi nhuận gộp"
          icon={TrendingUp}
        >
          {chartData.length ? (
            <ProfitAreaChart data={chartData} />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Chưa có dữ liệu"
              description="Không có đơn hàng nào đã giao trong khoảng thời gian này."
            />
          )}
        </SectionCard>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={reportQ.isLoading}
        isError={reportQ.isError}
        onRetry={reportQ.refetch}
        toolbar={toolbar}
        getRowId={(row) => row.key}
        pageSize={20}
        totalLabel="dòng"
        emptyState={
          <EmptyState
            icon={TrendingUp}
            title="Chưa có dữ liệu"
            description="Không có đơn hàng nào đã giao trong khoảng thời gian này."
          />
        }
      />
    </div>
  );
}

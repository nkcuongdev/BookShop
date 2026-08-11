import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Coins, History, MoreHorizontal, RefreshCw, Search, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatCard } from "@/components/admin/common/StatCard";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TierBadge from "@/components/loyalty/TierBadge";
import PointsAdjustDialog from "./PointsAdjustDialog";
import {
  useLoyaltyMembers,
  useLoyaltyProgram,
  useLoyaltyStats,
  useRecalcMemberTier,
} from "@/features/admin/loyalty/hooks";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function LoyaltyMembersList() {
  const [search, setSearch] = useState("");
  const [tierKey, setTierKey] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [adjusting, setAdjusting] = useState(null);
  const debounced = useDebounce(search, 250);

  const program = useLoyaltyProgram();
  const stats = useLoyaltyStats();
  const recalc = useRecalcMemberTier();
  const query = useLoyaltyMembers({
    search: debounced,
    tierKey,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const members = query.data?.members || [];
  const total = query.data?.pagination?.total || 0;
  const pageCount = query.data?.pagination?.totalPages || 0;

  const columns = [
    {
      id: "customer",
      header: "Khách hàng",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.email}
          </div>
        </div>
      ),
    },
    {
      id: "tier",
      header: "Hạng",
      cell: ({ row }) =>
        row.original.tierKey ? (
          <TierBadge
            tier={row.original.tierKey}
            label={row.original.tierLabel}
            size="sm"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Chưa xét</span>
        ),
    },
    {
      id: "balance",
      header: "Số dư điểm",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.pointsBalance.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      id: "debt",
      header: "Nợ điểm",
      cell: ({ row }) => (
        <span className={row.original.pointsDebt > 0 ? "font-medium tabular-nums text-danger-strong" : "tabular-nums text-muted-foreground"}>
          {(row.original.pointsDebt || 0).toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      id: "lifetime",
      header: "Tích / Tiêu",
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.original.lifetimeEarned.toLocaleString("vi-VN")} /{" "}
          {row.original.lifetimeRedeemed.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      id: "spend",
      header: "Chi tiêu 12T",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatVND(row.original.spend12m)}</span>
      ),
    },
    {
      id: "evaluated",
      header: "Xét hạng",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.tierEvaluatedAt
            ? formatDateVN(row.original.tierEvaluatedAt)
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Hành động">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/admin/loyalty/members/${row.original.id}`}>
                <History className="size-4" />
                Xem lịch sử điểm
              </Link>
            </DropdownMenuItem>
            <PermissionGate permission="loyalty.manage">
              <DropdownMenuItem onClick={() => recalc.mutate(row.original.id)}>
                <RefreshCw className="size-4" />
                Xét lại hạng
              </DropdownMenuItem>
            </PermissionGate>
            <PermissionGate permission="loyalty.adjust">
              <DropdownMenuItem onClick={() => setAdjusting(row.original)}>
                <Settings2 className="size-4" />
                Điều chỉnh điểm
              </DropdownMenuItem>
            </PermissionGate>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Điểm & hạng thành viên"
        description="Số dư điểm, hạng và lịch sử tích điểm của từng khách hàng."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={Coins}
          accent="amber"
          title="Điểm đang lưu hành"
          value={(stats.data?.outstandingPoints || 0).toLocaleString("vi-VN")}
          footer={`Giá trị quy đổi ${formatVND(stats.data?.outstandingValue || 0)}`}
        />
        <StatCard
          icon={AlertTriangle}
          accent="rose"
          title="Nợ điểm chờ bù"
          value={(stats.data?.pointsDebt || 0).toLocaleString("vi-VN")}
          footer={`${stats.data?.customersWithDebt || 0} khách hàng · tự bù vào lần tích tiếp theo`}
        />
      </div>

      <DataTable
        columns={columns}
        data={members}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(row) => row.id}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={pageCount}
        totalRows={total}
        totalLabel="khách hàng"
        toolbar={
          <DataTableToolbar>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên hoặc email"
                className="pl-9"
              />
            </div>
            <Select
              value={tierKey || "all"}
              onValueChange={(value) => setTierKey(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tất cả hạng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả hạng</SelectItem>
                {(program.data?.tiers || []).map((tier) => (
                  <SelectItem key={tier.key} value={tier.key}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableToolbar>
        }
      />

      <PointsAdjustDialog
        member={adjusting}
        open={Boolean(adjusting)}
        onOpenChange={(open) => !open && setAdjusting(null)}
      />
    </div>
  );
}

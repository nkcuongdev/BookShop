import { useMemo, useState } from "react";
import {
  Building2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeleteSupplier,
  useSuppliers,
  useToggleSupplier,
} from "@/features/admin/suppliers/hooks";
import {
  formatSupplierAddress,
  paymentTermsLabel,
} from "@/features/admin/suppliers/schema";
import { SupplierFormDialog } from "./SupplierFormDialog";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";

export default function SuppliersList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const suppliersQ = useSuppliers({
    ...(debounced ? { search: debounced } : {}),
    ...(status !== "all" ? { status } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });
  const toggleMut = useToggleSupplier();
  const deleteMut = useDeleteSupplier();

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (supplier) => {
    setEditing(supplier);
    setDialogOpen(true);
  };
  const handleDelete = async (supplier) => {
    const ok = await confirm({
      title: "Xoá nhà cung cấp?",
      description: `Xoá "${supplier.name}"? Nhà cung cấp đã phát sinh phiếu nhập sẽ không xoá được.`,
      variant: "destructive",
      confirmText: "Xoá",
    });
    if (ok) deleteMut.mutate(supplier._id);
  };

  const data = useMemo(
    () => suppliersQ.data?.suppliers || [],
    [suppliersQ.data]
  );

  const columns = [
    {
      id: "supplier",
      header: "Nhà cung cấp",
      cell: ({ row }) => {
        const supplier = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground line-clamp-1">
                {supplier.name}
              </p>
              <code className="font-mono text-xs text-muted-foreground">
                {supplier.code}
              </code>
            </div>
          </div>
        );
      },
    },
    {
      id: "contact",
      header: "Liên hệ",
      cell: ({ row }) => {
        const supplier = row.original;
        const person = supplier.contactPerson?.name;
        return (
          <div className="text-xs">
            <p className="text-foreground">{supplier.phone || "—"}</p>
            <p className="text-muted-foreground line-clamp-1">
              {person ? `${person}` : supplier.email || "—"}
            </p>
          </div>
        );
      },
    },
    {
      id: "address",
      header: "Địa chỉ",
      cell: ({ row }) => (
        <p className="max-w-[220px] text-xs text-muted-foreground line-clamp-2">
          {formatSupplierAddress(row.original.address) || "—"}
        </p>
      ),
    },
    {
      id: "terms",
      header: "Thanh toán",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="text-foreground">
            {paymentTermsLabel(row.original.paymentTerms)}
          </p>
          <p className="text-muted-foreground">
            {row.original.leadTimeDays > 0
              ? `Giao ~${row.original.leadTimeDays} ngày`
              : "Chưa đặt lead time"}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const supplier = row.original;
        return (
          <div className="flex justify-end">
            <PermissionGate permission="supplier.write">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Khác"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEdit(supplier)}>
                    <Pencil className="size-4" />
                    Chỉnh sửa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleMut.mutate(supplier._id)}>
                    <Power className="size-4" />
                    {supplier.status === "active" ? "Ngừng hợp tác" : "Kích hoạt"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                    onClick={() => handleDelete(supplier)}
                  >
                    <Trash2 className="size-4" />
                    Xoá
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PermissionGate>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm tên, mã, MST, SĐT..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 pl-8"
        />
      </div>
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="active">Đang hợp tác</SelectItem>
          <SelectItem value="inactive">Ngừng hợp tác</SelectItem>
        </SelectContent>
      </Select>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhà cung cấp"
        description={`${suppliersQ.data?.pagination?.total ?? data.length} nhà cung cấp`}
        actions={
          <PermissionGate permission="supplier.write">
            <Button onClick={handleCreate}>
              <Plus className="size-4" />
              Thêm nhà cung cấp
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={suppliersQ.isLoading}
        isError={suppliersQ.isError}
        onRetry={() => suppliersQ.refetch()}
        toolbar={toolbar}
        totalLabel="nhà cung cấp"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={suppliersQ.data?.pagination?.totalPages || 0}
        totalRows={suppliersQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={Building2}
            title="Chưa có nhà cung cấp"
            description="Thêm nhà cung cấp để bắt đầu tạo phiếu nhập hàng."
            action={
              <Button onClick={handleCreate}>
                <Plus className="size-4" />
                Thêm nhà cung cấp
              </Button>
            }
          />
        }
      />

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editing}
      />
    </div>
  );
}

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "./TableSkeleton";
import { DataTablePagination } from "./DataTablePagination";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { cn } from "@/lib/utils";

export function DataTable({
  columns,
  data = [],
  isLoading = false,
  isError = false,
  onRetry,
  toolbar,
  onRowClick,
  emptyState,
  getRowId,
  enableSelection = false,
  enableSorting = true,
  pageSize = 10,
  className,
  totalLabel,
  pagination,
  onPaginationChange,
  pageCount,
  totalRows,
}) {
  const [sorting, setSorting] = useState([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnFilters, setColumnFilters] = useState([]);

  // TanStack Table intentionally exposes mutable function references.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection,
      columnFilters,
      ...(pagination ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? undefined : getPaginationRowModel(),
    onPaginationChange,
    manualPagination: Boolean(pagination),
    pageCount,
    enableRowSelection: enableSelection,
    getRowId: getRowId,
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn("rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest", className)}>
      {toolbar && <div className="px-4 pt-4">{toolbar}</div>}

      {isLoading ? (
        <TableSkeleton rows={8} cols={columns.length} />
      ) : isError ? (
        <div className="p-10">
          <ErrorState onRetry={onRetry} />
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <div className="p-10">{emptyState || <EmptyState title="Không có dữ liệu" />}</div>
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={{ width: h.getSize?.() || undefined }}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="border-t border-border">
        <DataTablePagination table={table} totalLabel={totalLabel} totalRows={totalRows} />
      </div>
    </div>
  );
}

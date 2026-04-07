"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  striped?: boolean;
  className?: string;
  pageSize?: number;
}

export function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  striped = true,
  className,
  pageSize = 10,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const pagedData = useMemo(
    () => data.slice(page * pageSize, (page + 1) * pageSize),
    [data, page, pageSize]
  );

  // Reset page when data changes
  React.useEffect(() => { setPage(0); }, [data.length]);

  return (
    <div className={cn("bg-white rounded-lg border border-darkBlack/10 overflow-visible", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  className={cn(
                    "px-6 py-4 text-left font-semibold",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedData.map((row, rowIndex) => (
                <motion.tr
                  key={rowIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: rowIndex * 0.05 }}
                  onClick={() => onRowClick?.(row, page * pageSize + rowIndex)}
                  className={cn(
                    "table-row",
                    striped && "table-row-striped",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key as string}
                      className={cn("px-6 py-4", col.className)}
                    >
                      {col.render
                        ? col.render(row, page * pageSize + rowIndex)
                        : (row[col.key as keyof T] as React.ReactNode)}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {data.length > pageSize && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-darkBlack/5">
          <p className="text-sm text-darkBlack/50">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-darkBlack/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-text">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-darkBlack/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

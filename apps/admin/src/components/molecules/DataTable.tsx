"use client";

import React from "react";
import { motion } from "framer-motion";
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
}

export function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  striped = true,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("bg-white rounded-3xl border border-darkBlack/10 overflow-visible", className)}>
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
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <motion.tr
                  key={rowIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: rowIndex * 0.05 }}
                  onClick={() => onRowClick?.(row, rowIndex)}
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
                        ? col.render(row, rowIndex)
                        : (row[col.key as keyof T] as React.ReactNode)}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

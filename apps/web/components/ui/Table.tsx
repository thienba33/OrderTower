// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  cellClassName?: string;
  headerClassName?: string;
};

export type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyText?: string;
  // Dat trong panel co tieu de rieng thi bo vien ngoai cua bang.
  bare?: boolean;
};

const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export function Table<T>({ columns, rows, rowKey, emptyText = "Không có dữ liệu", bare = false }: TableProps<T>) {
  return (
    <div className={bare ? "overflow-x-auto" : "overflow-x-auto rounded-lg border bg-white"}>
      <table className="w-full text-sm">
        <thead className="bg-white">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`h-11 whitespace-nowrap border-l px-3 align-middle text-xs font-semibold text-gray-800 first:border-l-0 ${ALIGN_CLASS[column.align ?? "left"]} ${column.headerClassName ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="border-t">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap border-l px-3 py-3 first:border-l-0 ${ALIGN_CLASS[column.align ?? "left"]} ${column.cellClassName ?? ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

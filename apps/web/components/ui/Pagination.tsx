"use client";

// SPDX-License-Identifier: Apache-2.0
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PaginationRange = {
  end: number;
  start: number;
  total: number;
};

export type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  range?: PaginationRange;
};

type PageItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };

function pageItems(page: number, totalPages: number): PageItem[] {
  const maxWindow = 5;
  const start = Math.max(1, Math.min(page - 2, totalPages - maxWindow + 1));
  const end = Math.min(totalPages, start + maxWindow - 1);
  const items: PageItem[] = [];
  if (start > 1) {
    items.push({ type: "page", page: 1 });
    if (start > 2) {
      items.push({ type: "ellipsis", key: "start" });
    }
  }
  for (let p = start; p <= end; p += 1) {
    items.push({ type: "page", page: p });
  }
  if (end < totalPages) {
    if (end < totalPages - 1) {
      items.push({ type: "ellipsis", key: "end" });
    }
    items.push({ type: "page", page: totalPages });
  }
  return items;
}

export function Pagination({ page, totalPages, onPageChange, range }: PaginationProps) {
  if (totalPages <= 1 && !range) {
    return null;
  }

  const buttonClass =
    "flex h-8 min-w-8 items-center justify-center rounded-md border border-gray-300 px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40";

  const nav =
    totalPages > 1 ? (
      <nav aria-label="Phân trang" className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`${buttonClass} hover:bg-gray-50`}
        >
          <ChevronLeft size={16} />
        </button>
        {pageItems(page, totalPages).map((item) =>
          item.type === "ellipsis" ? (
            <span key={item.key} aria-hidden="true" className="px-1 text-[13px] text-gray-400">
              …
            </span>
          ) : (
            <button
              key={item.page}
              type="button"
              aria-label={`Trang ${item.page}`}
              aria-current={item.page === page ? "page" : undefined}
              onClick={() => onPageChange(item.page)}
              className={`${buttonClass} ${
                item.page === page
                  ? "border-red-700 bg-red-700 text-white"
                  : "hover:bg-gray-50"
              }`}
            >
              {item.page}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Trang sau"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`${buttonClass} hover:bg-gray-50`}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    ) : null;

  if (!range) {
    return nav;
  }

  return (
    <div className="flex h-14 items-center justify-between gap-3 px-4">
      <p className="text-xs text-gray-400">
        Hiển thị{" "}
        <span className="font-medium text-gray-600">
          {range.start}-{range.end}
        </span>{" "}
        /{" "}
        <span className="font-medium text-gray-600">{range.total}</span> bản ghi
      </p>
      {nav}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import { isUrgentEta } from "../../data/telesale";
import type { PriorityRow } from "./telesale-types";

const DISPATCH_PAGE_SIZE = 7;

const columns: TableColumn<PriorityRow>[] = [
  { key: "id", header: "Mã đơn", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[109px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[89px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[149px]" },
  { key: "phone", header: "SĐT", render: (row) => row.phone, cellClassName: "w-[129px]" },
  { key: "deadline", header: "Mốc giao hẹn", render: (row) => row.deadline, cellClassName: "w-[119px]" },
  { key: "product", header: "Sản phẩm", render: (row) => row.product, cellClassName: "w-[187px]" },
  {
    key: "eta",
    header: "ETA",
    render: (row) => (
      <span className={row.eta === "Quá hạn" || isUrgentEta(row.eta) ? "font-medium text-red-700" : ""}>
        {row.eta}
      </span>
    ),
    cellClassName: "w-[79px]",
  },
  { key: "suggestion", header: "Gợi ý", render: (row) => row.suggestion, cellClassName: "w-[129px]" },
  { key: "reason", header: "Lý do", render: (row) => row.reason, cellClassName: "w-[179px]" },
];

export default function TelesaleClient({ rows }: { rows: PriorityRow[] }) {
  const [search, setSearch] = useState("");
  const [sortByEta, setSortByEta] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = rows;
    if (query) {
      result = rows.filter(
        (row) =>
          row.id.toLowerCase().includes(query) ||
          row.customer.toLowerCase().includes(query) ||
          row.phone.includes(query),
      );
    }
    if (sortByEta) {
      // Quá hạn (etaMinutes -1) lên trước, không có mốc xuống cuối.
      const key = (row: PriorityRow) =>
        row.etaMinutes === null ? Number.MAX_SAFE_INTEGER : row.etaMinutes;
      result = [...result].sort((a, b) => key(a) - key(b));
    }
    return result;
  }, [rows, search, sortByEta]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / DISPATCH_PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * DISPATCH_PAGE_SIZE, page * DISPATCH_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Telesale</h1>

      <section className="rounded-xl border bg-white">
        <div className="flex h-[52px] items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">
            DANH SÁCH ĐƠN NÊN ƯU TIÊN GỌI ({filtered.length})
          </h2>
        </div>
        <div className="h-px bg-gray-200" />
        <div className="flex flex-wrap items-center gap-3 p-4">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã đơn, SĐT, khách hàng..."
            aria-label="Tìm đơn ưu tiên"
            className="h-10 w-[340px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={() => {
              setSortByEta((current) => !current);
              setPage(1);
            }}
            className={`flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
              sortByEta
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            Sắp xếp theo ETA
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSortByEta(false);
              setPage(1);
            }}
            className="flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
        <div className="h-px bg-gray-200" />
        <div className="overflow-x-auto">
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(row) => row.id}
            emptyText="Không có đơn nào cần ưu tiên gọi"
            bare
          />
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          range={{
            start: filtered.length === 0 ? 0 : (page - 1) * DISPATCH_PAGE_SIZE + 1,
            end: Math.min(page * DISPATCH_PAGE_SIZE, filtered.length),
            total: filtered.length,
          }}
        />
      </section>
    </div>
  );
}

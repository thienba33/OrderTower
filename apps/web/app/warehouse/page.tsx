"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  defaultSupplier,
  formatExpiry,
  INCOMING_ROWS,
  INVENTORY_GROUPS,
  INVENTORY_ROWS,
  INVENTORY_STATUS_PILL,
  INVENTORY_STATUSES,
  SUPPLIERS,
  type IncomingRow,
  type InventoryRow,
  type InventoryStatus,
} from "../../data/inventory";

const PAGE_SIZE = 6;

const inventoryColumns: TableColumn<InventoryRow>[] = [
  { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[109px]" },
  { key: "name", header: "Sản phẩm", render: (row) => row.name, cellClassName: "w-[218px]" },
  { key: "lot", header: "Số lô", render: (row) => row.lot, cellClassName: "w-[99px]" },
  { key: "expiry", header: "Hạn dùng", render: (row) => formatExpiry(row.expiry), cellClassName: "w-[109px]" },
  { key: "stock", header: "Tồn kho", render: (row) => String(row.stock), cellClassName: "w-[89px]" },
  { key: "reserved", header: "Đã giữ", render: (row) => String(row.reserved), cellClassName: "w-[89px]" },
  { key: "soldPerDay", header: "Bán / ngày", render: (row) => String(row.soldPerDay), cellClassName: "w-[89px]" },
  { key: "daysLeft", header: "Đủ dùng", render: (row) => `${row.daysLeft} ngày`, cellClassName: "w-[99px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${INVENTORY_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[149px]",
  },
];

const incomingColumns: TableColumn<IncomingRow>[] = [
  { key: "id", header: "Mã nhập", render: (row) => row.id, cellClassName: "w-[139px]" },
  { key: "product", header: "SKU / Sản phẩm", render: (row) => `${row.sku} - ${row.product}`, cellClassName: "w-[199px]" },
  { key: "quantity", header: "Số lượng", render: (row) => row.quantity, cellClassName: "w-[139px]" },
  { key: "expectedDate", header: "Dự kiến về", render: (row) => row.expectedDate, cellClassName: "w-[179px]" },
  { key: "status", header: "Trạng thái", render: (row) => row.status, cellClassName: "w-[179px]" },
  { key: "note", header: "Ghi chú", render: (row) => row.note, cellClassName: "w-[318px] !whitespace-normal" },
];

export default function KhoPage() {
  const [items] = useState<InventoryRow[]>(INVENTORY_ROWS);
  const [incoming, setIncoming] = useState<IncomingRow[]>(INCOMING_ROWS);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InventoryRow>(INVENTORY_ROWS[0]);
  const [proposal, setProposal] = useState<InventoryRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const incomingRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const count = (status: InventoryStatus) => items.filter((row) => row.status === status).length;
    return {
      total: items.length,
      low: count("Sắp hết"),
      expiring: count("Sắp hết hạn"),
      watching: count("Cần theo dõi"),
      incoming: incoming.length,
    };
  }, [items, incoming.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((row) => {
      if (groupFilter && row.group !== groupFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (q && ![row.sku, row.name, row.lot].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, search, groupFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedIncoming = incoming.find((row) => row.sku === selected.sku);

  const openProposal = (row: InventoryRow) => {
    setProposal(row);
    setQuantity(row.sku === "NM-25" && row.lot === "L-118" ? "120 chai" : `${Math.max(60, Math.ceil((row.soldPerDay * 14) / 10) * 10)} ${row.unit}`);
    setSupplier(defaultSupplier(row.group));
    setExpectedDate("05/11/2026");
  };

  const submitProposal = () => {
    if (!proposal || !quantity.trim()) return;
    const nextNumber = 31 + incoming.length;
    setIncoming((prev) => [
      ...prev,
      {
        id: `NH-0${nextNumber}`,
        sku: proposal.sku,
        product: proposal.name.replace(/ 500ml| 500g| 250g| 200g| 300g/, ""),
        quantity: quantity.trim(),
        expectedDate: expectedDate.trim() || "05/11/2026",
        status: "Chờ xác nhận",
        note: `Theo đề xuất ${proposal.lot}`,
      },
    ]);
    setProposal(null);
  };

  const kpis = [
    { label: "Tổng SKU", value: counts.total },
    { label: "Sắp hết", value: counts.low },
    { label: "Sắp hết hạn", value: counts.expiring },
    { label: "Lô đang theo dõi", value: counts.watching },
    { label: "Hàng đang về", value: counts.incoming },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Kho và tồn kho - Kho duy nhất</h1>
        <button
          type="button"
          onClick={() => openProposal(selected)}
          className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
        >
          Tạo đề xuất nhập hàng
        </button>
        <button
          type="button"
          onClick={() => incomingRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
        >
          Hàng đang về
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-bold text-red-800">CẢNH BÁO TỒN KHO: Lô L-118 còn 36 chai, hết trong 4 ngày trong khi đơn vẫn vào.</span>
            <span className="text-gray-500"> Đề xuất nhập 120 chai đã gửi chờ quản lý duyệt.</span>
          </p>
          <button
            type="button"
            onClick={() => openProposal(INVENTORY_ROWS[0])}
            className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
          >
            Xem đề xuất
          </button>
        </div>
        <div className="h-[3px] w-full bg-red-600" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm SKU, tên sản phẩm, số lô..."
            aria-label="Tìm SKU, tên sản phẩm, số lô"
            className="h-10 w-[340px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <select
            value={groupFilter}
            onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
            aria-label="Nhóm sản phẩm"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả nhóm</option>
            {INVENTORY_GROUPS.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Trạng thái tồn"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả trạng thái tồn</option>
            {INVENTORY_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setSearch(""); setGroupFilter(""); setStatusFilter(""); setPage(1); }}
            className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Danh sách tồn kho theo lô và hạn dùng</p>
        </div>
        <Table
          columns={[
            ...inventoryColumns,
            {
              key: "action",
              header: "Hành động",
              render: (row) => (
                <button
                  type="button"
                  onClick={() => (row.status === "Sắp hết" ? openProposal(row) : setSelected(row))}
                  className="text-xs font-medium text-red-700 underline"
                >
                  {row.status === "Sắp hết" ? "Đề xuất nhập" : "Chi tiết"}
                </button>
              ),
              cellClassName: "w-[99px]",
            },
          ]}
          rows={pageRows}
          rowKey={(row) => `${row.sku}-${row.lot}`}
          emptyText="Không có lô hàng nào khớp bộ lọc"
          bare
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          range={{ start: filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, end: Math.min(page * PAGE_SIZE, filtered.length), total: filtered.length }}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Chi tiết tồn kho: {selected.sku} - Lô {selected.lot}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Tồn kho hiện tại</p>
            <p className="text-sm font-semibold text-gray-900">{selected.stock} {selected.unit}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Đã giữ cho đơn</p>
            <p className="text-sm font-semibold text-gray-900">{selected.reserved} {selected.unit}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Hàng đang về</p>
            <p className="text-sm font-semibold text-gray-900">
              {selectedIncoming ? `${selectedIncoming.quantity} - về ${selectedIncoming.expectedDate.split("/").slice(0, 2).join("/")}` : "Chưa có lô về"}
            </p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Tốc độ bán</p>
            <p className="text-sm font-semibold text-gray-900">{selected.soldPerDay} {selected.unit} / ngày</p>
          </div>
        </div>
      </div>

      <div ref={incomingRef} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Hàng đang về</p>
        </div>
        <Table
          columns={incomingColumns}
          rows={incoming}
          rowKey={(row) => row.id}
          emptyText="Không có lô hàng nào đang về"
          bare
        />
      </div>

      <Modal
        open={proposal !== null}
        onClose={() => setProposal(null)}
        title="Tạo đề xuất nhập hàng"
        footer={
          <>
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitProposal}
              disabled={!quantity.trim()}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Gửi duyệt
            </button>
          </>
        }
      >
        {proposal && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {proposal.sku} - {proposal.name} - Lô {proposal.lot}
            </p>
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">Căn cứ đề xuất (hiển thị rõ đầu vào)</p>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tồn kho hiện tại</p>
                <p className="font-medium text-gray-900">{proposal.stock} {proposal.unit} (đã giữ {proposal.reserved} {proposal.unit})</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tốc độ bán</p>
                <p className="font-medium text-gray-900">{proposal.soldPerDay} {proposal.unit} / ngày</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Hết trong</p>
                <p className="font-medium text-gray-900">{proposal.daysLeft} ngày - HSD {formatExpiry(proposal.expiry)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Dự báo tuần tới</p>
                <p className="font-medium text-gray-900">{proposal.forecast}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-quantity" className="text-sm font-medium text-gray-700">Số lượng nhập</label>
              <input
                id="proposal-quantity"
                type="text"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-supplier" className="text-sm font-medium text-gray-700">Nhà cung cấp</label>
              <select
                id="proposal-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="h-8 rounded-md border border-gray-300 px-2 text-xs text-gray-700"
              >
                {SUPPLIERS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-date" className="text-sm font-medium text-gray-700">Ngày dự kiến về</label>
              <input
                id="proposal-date"
                type="text"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

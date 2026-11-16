"use client";

// SPDX-License-Identifier: Apache-2.0

import { useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  CONTACT_HISTORY,
  CSKH_KPIS,
  RETURN_CHANNELS,
  TICKET_CHANNELS,
  TICKET_ROWS,
  TICKET_STATUSES,
  TICKET_STATUS_PILL,
  TICKET_TYPES,
  type ContactHistoryRow,
  type TicketChannel,
  type TicketRow,
  type TicketStatus,
  type TicketType,
} from "../../data/cskh";

const PAGE_SIZE = 6;

const ticketColumns: TableColumn<TicketRow>[] = [
  { key: "id", header: "Mã YC", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[100px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[110px]" },
  { key: "orderId", header: "Mã đơn", render: (row) => row.orderId, cellClassName: "w-[100px]" },
  { key: "type", header: "Loại yêu cầu", render: (row) => row.type, cellClassName: "w-[150px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[80px]" },
  { key: "content", header: "Nội dung", render: (row) => row.content, cellClassName: "w-[220px] !whitespace-normal" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${TICKET_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[140px]",
  },
  { key: "handler", header: "Người xử lý", render: (row) => row.handler, cellClassName: "w-[120px]" },
  { key: "updated", header: "Cập nhật", render: (row) => row.updated, cellClassName: "w-[140px]" },
];

const historyColumns: TableColumn<ContactHistoryRow>[] = [
  { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "w-[140px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[150px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[130px]" },
  { key: "result", header: "Kết quả", render: (row) => row.result, cellClassName: "w-[220px]" },
  { key: "note", header: "Ghi chú", render: (row) => row.note, cellClassName: "w-[520px] !whitespace-normal" },
];

export default function CskhPage() {
  const [tickets, setTickets] = useState<TicketRow[]>(TICKET_ROWS);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [callOnly, setCallOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [createdCount, setCreatedCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [formType, setFormType] = useState<TicketType>("Giao trễ");
  const [formChannel, setFormChannel] = useState<TicketChannel>("Chat");
  const [formContent, setFormContent] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const bannerCounts = useMemo(
    () => ({
      late: tickets.filter((row) => row.type === "Giao trễ").length,
      toCall: tickets.filter((row) => row.needsCall).length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((row) => {
      if (callOnly && !row.needsCall) return false;
      if (typeFilter && row.type !== typeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (channelFilter && row.channel !== channelFilter) return false;
      if (q && ![row.id, row.customer, row.orderId, row.content].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tickets, search, typeFilter, statusFilter, channelFilter, callOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setChannelFilter("");
    setCallOnly(false);
    setPage(1);
  };

  const showCallList = () => {
    setCallOnly(true);
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const openForm = () => {
    setFormCustomer("");
    setFormOrderId("");
    setFormType("Giao trễ");
    setFormChannel("Chat");
    setFormContent("");
    setFormOpen(true);
  };

  const submitTicket = () => {
    if (!formCustomer.trim() || !formOrderId.trim() || !formContent.trim()) return;
    const now = new Date();
    const updated = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setTickets((prev) => [
      {
        id: `YC-0${32 + createdCount}`,
        customer: formCustomer.trim(),
        orderId: formOrderId.trim(),
        type: formType,
        channel: formChannel,
        content: formContent.trim(),
        status: "Mới",
        handler: "Chưa gán",
        updated,
        needsCall: false,
      },
      ...prev,
    ]);
    setCreatedCount((count) => count + 1);
    setPage(1);
    setFormOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Chăm sóc khách hàng</h1>
        <button
          type="button"
          onClick={openForm}
          className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
        >
          Tạo yêu cầu hỗ trợ
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {CSKH_KPIS.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-bold text-red-800">CẢNH BÁO: {bannerCounts.late} đơn trễ hạn - {bannerCounts.toCall} đơn chưa gọi lại.</span>
            <span className="text-gray-500"> Ưu tiên gọi theo mốc giao hẹn, không gọi theo hãng vận chuyển.</span>
          </p>
          <button
            type="button"
            onClick={showCallList}
            className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
          >
            Xem danh sách cần gọi
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
            placeholder="Tìm mã đơn, khách hàng, nội dung..."
            aria-label="Tìm mã đơn, khách hàng, nội dung"
            className="h-10 w-[340px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            aria-label="Loại yêu cầu"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả loại yêu cầu</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Trạng thái"
            className="h-10 w-[180px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả trạng thái</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
            aria-label="Kênh"
            className="h-10 w-[160px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả kênh</option>
            {TICKET_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
        {callOnly && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-sm text-gray-700">Đang lọc: {bannerCounts.toCall} yêu cầu cần gọi lại.</p>
            <button
              type="button"
              onClick={() => { setCallOnly(false); setPage(1); }}
              className="text-xs font-medium text-red-700 underline"
            >
              Bỏ lọc này
            </button>
          </div>
        )}
      </div>

      <div ref={tableRef} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Yêu cầu hỗ trợ</p>
        </div>
        <Table
          columns={ticketColumns}
          rows={pageRows}
          rowKey={(row) => row.id}
          emptyText="Không có yêu cầu nào khớp bộ lọc"
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
        <p className="text-sm font-semibold text-gray-900">Hoàn hàng theo kênh (10/120 đơn = 8%)</p>
        {RETURN_CHANNELS.map((row) => (
          <div key={row.channel} className="flex items-center gap-3">
            <p className="w-[110px] text-[13px] font-medium text-gray-800">{row.channel}</p>
            <div className="h-[10px] w-[520px] max-w-full rounded-full bg-gray-200">
              <div
                className="h-[10px] rounded-full bg-red-700"
                style={{ width: `${row.percent}%` }}
              />
            </div>
            <p className={`text-[13px] font-semibold ${row.percent >= 18 ? "text-red-700" : "text-gray-800"}`}>
              {row.returns}/{row.orders} đơn ({row.percent}%)
            </p>
          </div>
        ))}
        <p className="text-xs text-gray-500">Kênh Chat vượt ngưỡng cảnh báo. Đã chuyển quản lý xem xét. Hệ thống không tự dừng nhận đơn, không tự thay đổi kênh bán.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Lịch sử liên hệ gần đây</p>
        </div>
        <Table
          columns={historyColumns}
          rows={CONTACT_HISTORY}
          rowKey={(row) => `${row.time}-${row.customer}`}
          emptyText="Chưa có lịch sử liên hệ"
          bare
        />
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Tạo yêu cầu hỗ trợ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitTicket}
              disabled={!formCustomer.trim() || !formOrderId.trim() || !formContent.trim()}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Tạo yêu cầu
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-customer" className="text-sm font-medium text-gray-700">Khách hàng</label>
            <input
              id="ticket-customer"
              type="text"
              value={formCustomer}
              onChange={(e) => setFormCustomer(e.target.value)}
              placeholder="Ví dụ: KH-033"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-order" className="text-sm font-medium text-gray-700">Mã đơn</label>
            <input
              id="ticket-order"
              type="text"
              value={formOrderId}
              onChange={(e) => setFormOrderId(e.target.value)}
              placeholder="Ví dụ: DH-1044"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-type" className="text-sm font-medium text-gray-700">Loại yêu cầu</label>
            <select
              id="ticket-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as TicketType)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-channel" className="text-sm font-medium text-gray-700">Kênh</label>
            <select
              id="ticket-channel"
              value={formChannel}
              onChange={(e) => setFormChannel(e.target.value as TicketChannel)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {TICKET_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-content" className="text-sm font-medium text-gray-700">Nội dung</label>
            <textarea
              id="ticket-content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={3}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500">Yêu cầu mới tạo có trạng thái &quot;Mới&quot;, chưa gán người xử lý, hiện đầu bảng.</p>
        </div>
      </Modal>
    </div>
  );
}

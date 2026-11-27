"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpCircle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import type {
  ApiNotification,
  ApiNotificationList,
  ApiNotificationType,
} from "./notification-types";

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<ApiNotificationType, string> = {
  "sla.overdue": "SLA quá hạn",
  "sla.escalation": "Escalation",
};

const TYPE_CLASS: Record<ApiNotificationType, string> = {
  "sla.overdue": "bg-amber-50 text-amber-800",
  "sla.escalation": "bg-red-50 text-red-800",
};

const TYPE_ICON: Record<ApiNotificationType, typeof AlertTriangle> = {
  "sla.overdue": AlertTriangle,
  "sla.escalation": ArrowUpCircle,
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function NotificationsClient({
  initialData,
  username,
  roles,
}: {
  initialData: ApiNotificationList;
  username: string;
  roles: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialData.items);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(initialData.items);
  }, [initialData.items]);

  const unreadCount = items.filter((item) => item.readAt === null).length;
  const filtered = useMemo(
    () =>
      filter === "unread"
        ? items.filter((item) => item.readAt === null)
        : items,
    [items, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const range = {
    start: filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1,
    end: Math.min(currentPage * PAGE_SIZE, filtered.length),
    total: filtered.length,
  };

  async function markRead(id: number): Promise<void> {
    setError("");
    setBusyId(id);
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: unknown }
          | null;
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : `API trả về ${response.status}.`,
        );
      }
      const updated = (await response.json()) as ApiNotification;
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không đánh dấu được.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead(): Promise<void> {
    setError("");
    setBulkBusy(true);
    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: unknown }
          | null;
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : `API trả về ${response.status}.`,
        );
      }
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) =>
          item.readAt === null ? { ...item, readAt: now } : item,
        ),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không đánh dấu được.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function refresh(): void {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Thông báo</h1>
          <p className="mt-1 text-sm text-gray-600">
            Cảnh báo SLA và escalation do automation tạo. Chỉ hiển thị thông
            báo gửi cho vai hoặc tài khoản của bạn.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 text-right text-xs text-gray-500">
          <div>
            <p className="font-medium text-gray-700">{username}</p>
            <p>{roles.join(" · ")}</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Tổng thông báo</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {items.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Chưa đọc</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {unreadCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Escalation</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {items.filter((item) => item.type === "sla.escalation").length}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setPage(1);
            }}
            className={
              filter === "all"
                ? "flex h-9 items-center gap-1.5 rounded-md bg-red-700 px-3 text-sm font-medium text-white"
                : "flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            }
          >
            <Bell size={14} />
            Tất cả
            <span
              className={
                filter === "all"
                  ? "rounded bg-white/20 px-1.5 text-xs"
                  : "rounded bg-gray-100 px-1.5 text-xs text-gray-600"
              }
            >
              {items.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter("unread");
              setPage(1);
            }}
            className={
              filter === "unread"
                ? "flex h-9 items-center gap-1.5 rounded-md bg-red-700 px-3 text-sm font-medium text-white"
                : "flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            }
          >
            <Inbox size={14} />
            Chưa đọc
            <span
              className={
                filter === "unread"
                  ? "rounded bg-white/20 px-1.5 text-xs"
                  : "rounded bg-gray-100 px-1.5 text-xs text-gray-600"
              }
            >
              {unreadCount}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0 || bulkBusy}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck size={15} />
          {bulkBusy ? "Đang xử lý..." : "Đánh dấu tất cả đã đọc"}
        </button>
      </div>

      {error !== "" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-12 text-center">
          <CheckCircle2 size={30} className="text-emerald-500" />
          <p className="text-sm font-medium text-gray-700">
            {filter === "unread"
              ? "Không còn thông báo chưa đọc."
              : "Chưa có thông báo nào."}
          </p>
          <p className="text-xs text-gray-500">
            Automation sẽ tạo thông báo khi task quá hạn hoặc cần escalation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pageRows.map((item) => {
            const TypeIcon = TYPE_ICON[item.type] ?? AlertTriangle;
            const unread = item.readAt === null;
            return (
              <article
                key={item.id}
                className={`flex flex-col gap-3 rounded-lg border border-l-4 bg-white p-4 md:flex-row md:items-start ${
                  unread ? "border-l-red-500" : "border-l-gray-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[item.type]}`}
                    >
                      <TypeIcon size={12} />
                      {TYPE_LABEL[item.type]}
                    </span>
                    <span className="text-xs text-gray-500">
                      Gửi: {item.audienceRole ?? item.audienceUser ?? "Nội bộ"}
                    </span>
                    {unread ? (
                      <span className="rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Chưa đọc
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{item.body}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    {formatDateTime(item.createdAt)}
                    {item.entityId ? ` · Đơn ${item.entityId}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-stretch">
                  {item.actionHref ? (
                    <Link
                      href={item.actionHref}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
                    >
                      Mở xử lý
                      <ChevronRight size={14} />
                    </Link>
                  ) : null}
                  {unread ? (
                    <button
                      type="button"
                      onClick={() => markRead(item.id)}
                      disabled={busyId === item.id}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      {busyId === item.id ? "Đang lưu..." : "Đã đọc"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            range={range}
          />
        </div>
      ) : null}
    </div>
  );
}

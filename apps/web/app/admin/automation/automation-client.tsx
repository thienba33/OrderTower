"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  ServerCog,
  XCircle,
} from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import type {
  ApiNotification,
  ApiNotificationPage,
} from "../../notifications/notification-types";
import {
  NOTIFICATION_PAGE_SIZE,
  RUN_PAGE_SIZE,
  type ApiAutomationJob,
  type ApiAutomationJobName,
  type ApiAutomationRun,
  type ApiAutomationRunPage,
  type ApiAutomationStatus,
} from "./automation-types";

const JOB_LABEL: Record<ApiAutomationJobName, string> = {
  "outbox-relay": "Outbox relay",
  "sla-scan": "SLA scan",
  "lakehouse-archive": "Lakehouse archive",
};

const JOB_DESCRIPTION: Record<ApiAutomationJobName, string> = {
  "outbox-relay": "Tự phát event pending, retry backoff, dead-letter.",
  "sla-scan": "Quét task quá hạn, tạo notification và escalation.",
  "lakehouse-archive":
    "Export đơn đã đóng quá retention ra Parquet, ghi manifest.",
};

function formatInterval(ms: number): string {
  if (ms >= 3_600_000) {
    return `${Math.round(ms / 3_600_000)} giờ`;
  }
  if (ms >= 60_000) {
    return `${Math.round(ms / 60_000)} phút`;
  }
  return `${Math.round(ms / 1000)} giây`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
}

function summaryText(summary: Record<string, unknown>): string {
  const parts = Object.entries(summary)
    .filter(([key]) => key !== "eventIds")
    .slice(0, 5)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key} ${value.length}`;
      }
      return `${key} ${String(value)}`;
    });
  const eventIds = summary.eventIds;
  if (Array.isArray(eventIds) && eventIds.length > 0) {
    parts.push(`events ${eventIds.join(", ")}`);
  }
  return parts.join(" · ") || "Không có dữ liệu";
}

function statusPill(status: "success" | "failed"): string {
  return status === "success"
    ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
    : "inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800";
}

function apiMessage(
  data: { message?: unknown } | null,
  status: number,
): string {
  return typeof data?.message === "string"
    ? data.message
    : `API trả về ${status}.`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: unknown }
    | null;
  if (!response.ok) {
    throw new Error(apiMessage(data as { message?: unknown } | null, response.status));
  }
  return data as T;
}

const runColumns: TableColumn<ApiAutomationRun>[] = [
  {
    key: "time",
    header: "Thời gian",
    render: (row) => formatDateTime(row.startedAt),
    cellClassName: "w-[170px]",
  },
  {
    key: "job",
    header: "Job",
    render: (row) => JOB_LABEL[row.jobName] ?? row.jobName,
    cellClassName: "w-[140px]",
  },
  {
    key: "trigger",
    header: "Nguồn",
    render: (row) =>
      row.trigger === "manual" ? "Chạy tay" : "Scheduler",
    cellClassName: "w-[110px]",
  },
  {
    key: "status",
    header: "Kết quả",
    render: (row) => (
      <span className={statusPill(row.status)}>
        {row.status === "success" ? (
          <CheckCircle2 size={12} />
        ) : (
          <XCircle size={12} />
        )}
        {row.status === "success" ? "Thành công" : "Lỗi"}
      </span>
    ),
    cellClassName: "w-[130px]",
  },
  {
    key: "duration",
    header: "Thời lượng",
    render: (row) => formatDuration(row.durationMs),
    cellClassName: "w-[110px]",
  },
  {
    key: "summary",
    header: "Tóm tắt",
    render: (row) =>
      row.error ? (
        <span className="text-red-700">{row.error}</span>
      ) : (
        <span className="text-gray-700">{summaryText(row.summary)}</span>
      ),
    cellClassName: "min-w-[300px]",
  },
];

const notificationColumns: TableColumn<ApiNotification>[] = [
  {
    key: "time",
    header: "Thời gian",
    render: (row) => formatDateTime(row.createdAt),
    cellClassName: "w-[170px]",
  },
  {
    key: "type",
    header: "Loại",
    render: (row) =>
      row.type === "sla.escalation" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
          <ArrowUpCircle size={12} />
          Escalation
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          <AlertTriangle size={12} />
          SLA quá hạn
        </span>
      ),
    cellClassName: "w-[140px]",
  },
  {
    key: "audience",
    header: "Gửi cho",
    render: (row) => row.audienceRole ?? row.audienceUser ?? "Nội bộ",
    cellClassName: "w-[150px]",
  },
  {
    key: "title",
    header: "Tiêu đề",
    render: (row) =>
      row.actionHref ? (
        <Link
          href={row.actionHref}
          className="font-medium text-gray-900 underline decoration-gray-300 hover:text-red-700"
        >
          {row.title}
        </Link>
      ) : (
        row.title
      ),
    cellClassName: "min-w-[280px]",
  },
  {
    key: "read",
    header: "Đọc",
    render: (row) => (row.readAt ? "Đã đọc" : "Chưa đọc"),
    cellClassName: "w-[100px]",
  },
];

export default function AutomationClient({
  initialStatus,
  initialRuns,
  initialNotifications,
}: {
  initialStatus: ApiAutomationStatus;
  initialRuns: ApiAutomationRunPage;
  initialNotifications: ApiNotificationPage;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [runsData, setRunsData] = useState(initialRuns);
  const [notificationsData, setNotificationsData] = useState(
    initialNotifications,
  );
  const [runsPage, setRunsPage] = useState(1);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [running, setRunning] = useState<ApiAutomationJobName | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const runsPageRef = useRef(1);
  const notificationsPageRef = useRef(1);

  useEffect(() => {
    runsPageRef.current = runsPage;
  }, [runsPage]);

  useEffect(() => {
    notificationsPageRef.current = notificationsPage;
  }, [notificationsPage]);

  useEffect(() => {
    const timer = setInterval(() => {
      void Promise.allSettled([
        loadStatus(),
        loadRuns(runsPageRef.current, false),
        loadNotifications(notificationsPageRef.current, false),
      ]);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function loadStatus(): Promise<void> {
    const data = await getJson<ApiAutomationStatus>("/api/automation/status");
    setStatus(data);
  }

  async function loadRuns(
    page: number,
    showLoading = true,
  ): Promise<void> {
    if (showLoading) {
      setLoadingRuns(true);
    }
    try {
      const data = await getJson<ApiAutomationRunPage>(
        `/api/automation/runs?limit=${RUN_PAGE_SIZE}&offset=${(page - 1) * RUN_PAGE_SIZE}`,
      );
      const totalPages = Math.max(1, Math.ceil(data.total / RUN_PAGE_SIZE));
      if (page > totalPages) {
        await loadRuns(totalPages, showLoading);
        return;
      }
      setRunsData(data);
      setRunsPage(page);
    } finally {
      if (showLoading) {
        setLoadingRuns(false);
      }
    }
  }

  async function loadNotifications(
    page: number,
    showLoading = true,
  ): Promise<void> {
    if (showLoading) {
      setLoadingNotifications(true);
    }
    try {
      const data = await getJson<ApiNotificationPage>(
        `/api/automation/notifications?limit=${NOTIFICATION_PAGE_SIZE}&offset=${(page - 1) * NOTIFICATION_PAGE_SIZE}`,
      );
      const totalPages = Math.max(
        1,
        Math.ceil(data.total / NOTIFICATION_PAGE_SIZE),
      );
      if (page > totalPages) {
        await loadNotifications(totalPages, showLoading);
        return;
      }
      setNotificationsData(data);
      setNotificationsPage(page);
    } finally {
      if (showLoading) {
        setLoadingNotifications(false);
      }
    }
  }

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setError("");
    try {
      await Promise.all([
        loadStatus(),
        loadRuns(runsPage),
        loadNotifications(notificationsPage),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không tải được automation.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function trigger(job: ApiAutomationJobName): Promise<void> {
    setRunning(job);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/automation/jobs/${encodeURIComponent(job)}/run`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => null)) as
        | ApiAutomationRun
        | { message?: unknown }
        | null;
      if (!response.ok) {
        throw new Error(apiMessage(data as { message?: unknown } | null, response.status));
      }
      const run = data as ApiAutomationRun;
      setMessage(
        `Đã chạy ${JOB_LABEL[job]}: ${run.status === "success" ? "thành công" : "lỗi"} · ${summaryText(run.summary)}`,
      );
      await Promise.all([
        loadStatus(),
        loadRuns(runsPage),
        loadNotifications(notificationsPage),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không chạy được job.",
      );
    } finally {
      setRunning(null);
    }
  }

  const runTotalPages = Math.max(
    1,
    Math.ceil(runsData.total / RUN_PAGE_SIZE),
  );
  const notificationTotalPages = Math.max(
    1,
    Math.ceil(notificationsData.total / NOTIFICATION_PAGE_SIZE),
  );
  const runRange = {
    start: runsData.total === 0 ? 0 : runsData.offset + 1,
    end: Math.min(runsData.offset + runsData.items.length, runsData.total),
    total: runsData.total,
  };
  const notificationRange = {
    start:
      notificationsData.total === 0 ? 0 : notificationsData.offset + 1,
    end: Math.min(
      notificationsData.offset + notificationsData.items.length,
      notificationsData.total,
    ),
    total: notificationsData.total,
  };
  const latestRun =
    status.jobs
      .map((job) => job.lastRun)
      .filter((run): run is ApiAutomationRun => run !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Tự động hóa hệ thống
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Scheduler nội bộ chạy outbox relay và SLA scan. Job chỉ tạo thông
            báo/nhật ký, không tự đổi trạng thái đơn hay phê duyệt.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Link
            href="/admin"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Quản trị
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Đang tải..." : "Làm mới"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Scheduler</p>
          <p
            className={
              status.enabled
                ? "mt-1 inline-flex items-center gap-1 text-lg font-semibold text-emerald-700"
                : "mt-1 inline-flex items-center gap-1 text-lg font-semibold text-gray-500"
            }
          >
            <Activity size={16} />
            {status.enabled ? "Đang bật" : "Đang tắt"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Lần chạy gần nhất</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {latestRun ? formatDateTime(latestRun.startedAt) : "--"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Tổng run log</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {runsData.total}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">
            Tổng notification
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {notificationsData.total}
          </p>
        </div>
      </div>

      {message !== "" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error !== "" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {status.jobs.map((job) => (
          <JobCard
            key={job.name}
            job={job}
            running={running === job.name}
            onRun={() => void trigger(job.name)}
          />
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Run log</h2>
          <span className="text-xs text-gray-500">
            Trang {runsPage}/{runTotalPages} · {runsData.total} dòng · tự làm
            mới mỗi 30 giây
          </span>
        </div>
        <div className={loadingRuns ? "opacity-60" : ""}>
          <Table
            columns={runColumns}
            rows={runsData.items}
            rowKey={(row) => String(row.id)}
            emptyText="Chưa có lần chạy nào. Bấm Chạy ngay để test."
          />
        </div>
        {runsData.total > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white">
            <Pagination
              page={runsPage}
              totalPages={runTotalPages}
              onPageChange={(page) => void loadRuns(page)}
              range={runRange}
            />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Notification
          </h2>
          <span className="text-xs text-gray-500">
            Trang {notificationsPage}/{notificationTotalPages} ·{" "}
            {notificationsData.total} dòng · tất cả vai trong tenant
          </span>
        </div>
        <div className={loadingNotifications ? "opacity-60" : ""}>
          <Table
            columns={notificationColumns}
            rows={notificationsData.items}
            rowKey={(row) => String(row.id)}
            emptyText="Chưa có notification. Chạy SLA scan khi có task quá hạn."
          />
        </div>
        {notificationsData.total > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white">
            <Pagination
              page={notificationsPage}
              totalPages={notificationTotalPages}
              onPageChange={(page) => void loadNotifications(page)}
              range={notificationRange}
            />
          </div>
        ) : null}
      </section>

      <p className="flex items-start gap-2 text-xs text-gray-500">
        <ServerCog size={14} className="mt-0.5 shrink-0" />
        Outbox retry tối đa 5 lần với backoff 30/60/90/120/150 giây; quá hạn
        thành dead-letter và có thể requeue qua API outbox. SLA scan dedup theo
        task/trạng thái/vai, escalation sau 60 phút.
      </p>
    </div>
  );
}

function JobCard({
  job,
  running,
  onRun,
}: {
  job: ApiAutomationJob;
  running: boolean;
  onRun: () => void;
}) {
  const last = job.lastRun;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {JOB_LABEL[job.name]}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {JOB_DESCRIPTION[job.name]}
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          <Play size={14} />
          {running ? "Đang chạy..." : "Chạy ngay"}
        </button>
      </div>
      <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
        <p className="inline-flex items-center gap-1">
          <Clock size={13} />
          Mỗi {formatInterval(job.intervalMs)}
        </p>
        <p>
          Lần cuối: {last ? formatDateTime(last.startedAt) : "chưa chạy"}
        </p>
        <p>
          Kết quả:{" "}
          {last ? (
            <span
              className={
                last.status === "success"
                  ? "font-medium text-emerald-700"
                  : "font-medium text-red-700"
              }
            >
              {last.status === "success" ? "thành công" : "lỗi"}
            </span>
          ) : (
            "--"
          )}
        </p>
      </div>
      <p className="rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
        {last ? summaryText(last.summary) : "Chưa có dữ liệu."}
      </p>
    </div>
  );
}

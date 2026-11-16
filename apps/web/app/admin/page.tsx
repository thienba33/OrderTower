// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import AdminClient from "./admin-client";
import type { AdminView, ApiAuditVerifyResult } from "./admin-types";
import type {
  ApiAuditRecord,
  ApiWorkflowDefinition,
} from "../orders/[id]/order-detail-types";

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

// Ngày theo giờ Việt Nam dạng YYYY-MM-DD để so sánh "hôm nay".
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isToday(iso: string, today: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return dayKeyFormat.format(date) === today;
}

// Gọi API, lỗi mạng thì trả null để trang quyết định hiện báo lỗi.
async function safeFetch(path: string): Promise<Response | null> {
  try {
    return await apiFetch(path);
  } catch {
    return null;
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await safeFetch(path);
  if (res === null || !res.ok) {
    const status = res === null ? 0 : res.status;
    throw new ApiError(status, `API trả về ${status === 0 ? "lỗi mạng" : status}.`);
  }
  return res.json().catch(() => null);
}

// Kết quả xác minh chuỗi hash là dữ liệu phụ: lỗi tải thì trả null để trang
// vẫn hiện, chỉ báo là chưa kiểm tra được chuỗi hash.
async function fetchVerify(): Promise<ApiAuditVerifyResult | null> {
  const data = await fetchJson("/audit/verify").catch(() => null);
  if (
    data === null ||
    typeof data !== "object" ||
    typeof (data as { valid?: unknown }).valid !== "boolean" ||
    typeof (data as { checked?: unknown }).checked !== "number" ||
    !("brokenAt" in data)
  ) {
    return null;
  }
  return data as ApiAuditVerifyResult;
}

export default async function QuanTriPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/admin", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Quản trị hệ thống" />;
  }

  let audit: ApiAuditRecord[];
  let definitions: ApiWorkflowDefinition[];
  let verify: ApiAuditVerifyResult | null;
  try {
    const [auditRaw, definitionsRaw, verifyResult] = await Promise.all([
      fetchJson("/audit"),
      fetchJson("/workflow/definitions"),
      fetchVerify(),
    ]);
    if (!Array.isArray(auditRaw)) {
      throw new ApiError(0, "API trả về danh sách audit không đúng dạng.");
    }
    if (!Array.isArray(definitionsRaw)) {
      throw new ApiError(0, "API trả về danh sách định nghĩa không đúng dạng.");
    }
    audit = auditRaw as ApiAuditRecord[];
    definitions = definitionsRaw as ApiWorkflowDefinition[];
    verify = verifyResult;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Quản trị hệ thống</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem nhật ký hệ thống từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được dữ liệu quản trị.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Quản trị hệ thống</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được dữ liệu quản trị: {message}
        </p>
      </div>
    );
  }

  const today = dayKeyFormat.format(new Date());
  const view: AdminView = {
    audit,
    verify,
    definitions,
    auditToday: audit.filter((record) => isToday(record.at, today)).length,
  };
  return <AdminClient view={view} />;
}

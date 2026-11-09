"use client";

// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  ADMIN_AUDIT_ROWS,
  ADMIN_REAL_CONNECTIONS,
  ADMIN_ROLES,
  ADMIN_SETTINGS,
  ADMIN_USERS,
  ADMIN_WORKFLOW_VERSIONS,
  USER_STATUS_PILL,
  WORKFLOW_DEFINITIONS,
  WORKFLOW_STATUS_PILL,
  auditHash,
  type AdminRole,
  type AdminSetting,
  type AdminUser,
  type AuditRow,
  type WorkflowDefinition,
} from "../../data/admin";

const PAGE_SIZE = 6;

const userColumns = (
  onEditRole: (user: AdminUser) => void,
  onToggleLock: (user: AdminUser) => void,
): TableColumn<AdminUser>[] => [
  { key: "name", header: "Tên", render: (row) => <span className="font-medium text-gray-900">{row.name}</span>, cellClassName: "w-[179px]" },
  { key: "email", header: "Email", render: (row) => row.email, cellClassName: "w-[238px]" },
  { key: "role", header: "Vai trò", render: (row) => row.role, cellClassName: "w-[179px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${USER_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[149px]",
  },
  { key: "lastLogin", header: "Lần đăng nhập", render: (row) => row.lastLogin, cellClassName: "w-[179px]" },
  {
    key: "actions",
    header: "Hành động",
    render: (row) => (
      <span className="flex items-center gap-3 text-xs text-gray-700">
        <button type="button" onClick={() => onEditRole(row)} className="hover:text-gray-900">
          Sửa vai trò
        </button>
        <button type="button" onClick={() => onToggleLock(row)} className="hover:text-gray-900">
          {row.status === "Đang hoạt động" ? "Khóa" : "Mở khóa"}
        </button>
      </span>
    ),
    cellClassName: "w-[229px]",
  },
];

const workflowColumns: TableColumn<WorkflowDefinition>[] = [
  { key: "name", header: "Luồng", render: (row) => <span className="font-medium text-gray-900">{row.name}</span>, cellClassName: "w-[219px]" },
  { key: "version", header: "Phiên bản", render: (row) => row.version, cellClassName: "w-[119px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${WORKFLOW_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[159px]",
  },
  { key: "approver", header: "Người duyệt", render: (row) => row.approver, cellClassName: "w-[179px]" },
  { key: "appliedDate", header: "Ngày áp dụng", render: (row) => row.appliedDate, cellClassName: "w-[159px]" },
  {
    key: "actions",
    header: "Hành động",
    render: (row) => (
      <span className="text-xs text-gray-700">
        Xem định nghĩa
        <span className="mx-3 text-gray-300">|</span>
        {row.canRollback ? "Quay lui có kiểm soát" : "Xem lịch sử"}
      </span>
    ),
    cellClassName: "w-[318px]",
  },
];

const auditColumns: TableColumn<AuditRow>[] = [
  { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "w-[139px]" },
  { key: "user", header: "Người dùng", render: (row) => row.user, cellClassName: "w-[169px]" },
  { key: "action", header: "Hành động", render: (row) => row.action, cellClassName: "w-[239px]" },
  { key: "target", header: "Đối tượng", render: (row) => row.target, cellClassName: "w-[199px]" },
  { key: "result", header: "Kết quả", render: (row) => row.result, cellClassName: "w-[129px]" },
  { key: "hash", header: "Hash", render: (row) => row.hash, cellClassName: "w-[278px]" },
];

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function QuanTriPage() {
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  const [auditRows, setAuditRows] = useState<AuditRow[]>(ADMIN_AUDIT_ROWS);
  const [settings, setSettings] = useState<AdminSetting[]>(ADMIN_SETTINGS);
  const [userPage, setUserPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<AdminRole>("Điều phối viên");
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>("Điều phối viên");

  const userTotalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const userPageRows = useMemo(() => {
    const start = (userPage - 1) * PAGE_SIZE;
    return users.slice(start, start + PAGE_SIZE);
  }, [users, userPage]);
  const userRange = useMemo(
    () => ({
      start: (userPage - 1) * PAGE_SIZE + 1,
      end: Math.min(userPage * PAGE_SIZE, users.length),
      total: users.length,
    }),
    [users, userPage],
  );

  const auditTotalPages = Math.max(1, Math.ceil(auditRows.length / PAGE_SIZE));
  const auditPageRows = useMemo(() => {
    const start = (auditPage - 1) * PAGE_SIZE;
    return auditRows.slice(start, start + PAGE_SIZE);
  }, [auditRows, auditPage]);
  const auditRange = useMemo(
    () => ({
      start: (auditPage - 1) * PAGE_SIZE + 1,
      end: Math.min(auditPage * PAGE_SIZE, auditRows.length),
      total: auditRows.length,
    }),
    [auditRows, auditPage],
  );

  const submitAddUser = () => {
    const name = formName.trim();
    const email = formEmail.trim();
    if (!name || !email) return;
    setUsers((current) => [
      { id: `U-${String(current.length + 1).padStart(2, "0")}`, name, email, role: formRole, status: "Đang hoạt động", lastLogin: "Chưa đăng nhập" },
      ...current,
    ]);
    setFormName("");
    setFormEmail("");
    setFormRole("Điều phối viên");
    setUserPage(1);
    setAddOpen(false);
  };

  const openEditRole = (user: AdminUser) => {
    setEditUser(user);
    setEditRole(user.role);
  };

  const submitEditRole = () => {
    if (!editUser) return;
    setUsers((current) => current.map((row) => (row.id === editUser.id ? { ...row, role: editRole } : row)));
    setEditUser(null);
  };

  const toggleLock = (user: AdminUser) => {
    setUsers((current) =>
      current.map((row) =>
        row.id === user.id
          ? { ...row, status: row.status === "Đang hoạt động" ? "Đã khóa" : "Đang hoạt động" }
          : row,
      ),
    );
  };

  const toggleSetting = (key: string) => {
    const setting = settings.find((row) => row.key === key);
    if (!setting) return;
    setSettings((current) => current.map((row) => (row.key === key ? { ...row, enabled: !row.enabled } : row)));
    setAuditRows((current) => [
      {
        time: currentTime(),
        user: "Admin",
        action: "Đổi cài đặt",
        target: setting.label,
        result: "Thành công",
        hash: auditHash(`setting-${key}-${current.length}`),
      },
      ...current,
    ]);
    setAuditPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Quản trị hệ thống</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
        >
          Thêm người dùng
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Người dùng</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{users.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Vai trò</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{ADMIN_ROLES.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Phiên bản Workflow</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{ADMIN_WORKFLOW_VERSIONS}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Kết nối thật</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{ADMIN_REAL_CONNECTIONS}</p>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Audit hôm nay</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{auditRows.length}</p>
        </div>
      </div>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Người dùng và phân quyền (chỉ thấy và làm đúng phần việc của vai trò)</h2>
        </div>
        <Table columns={userColumns(openEditRole, toggleLock)} rows={userPageRows} rowKey={(row) => row.id} bare />
        <Pagination page={userPage} totalPages={userTotalPages} onPageChange={setUserPage} range={userRange} />
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Định nghĩa Workflow (tệp có phiên bản, engine đọc tệp để quyết định)</h2>
        </div>
        <Table columns={workflowColumns} rows={WORKFLOW_DEFINITIONS} rowKey={(row) => row.id} bare />
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <div className="flex h-11 items-center px-4">
          <h2 className="text-sm font-semibold text-gray-900">Audit log (chỉ ghi thêm, hash nối chuỗi)</h2>
        </div>
        <Table
          columns={auditColumns}
          rows={auditPageRows}
          rowKey={(row, index) => `${row.time}-${row.user}-${row.action}-${index}`}
          bare
        />
        <Pagination page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} range={auditRange} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Cài đặt hệ thống (mọi thay đổi ghi audit log)</h2>
        <div className="mt-3 flex flex-col gap-3">
          {settings.map((setting) => (
            <div key={setting.key} className="flex items-center gap-3">
              <p className="flex-1 text-[13px] font-medium text-gray-900">{setting.label}</p>
              <span
                className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${
                  setting.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-700"
                }`}
              >
                {setting.enabled ? "Bật" : "Tắt"}
              </span>
              <button
                type="button"
                onClick={() => toggleSetting(setting.key)}
                className="flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700"
              >
                Đổi
              </button>
            </div>
          ))}
        </div>
      </section>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Thêm người dùng"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitAddUser}
              disabled={!formName.trim() || !formEmail.trim()}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Thêm người dùng
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-user-name" className="text-sm font-medium text-gray-700">Tên</label>
            <input
              id="admin-user-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ví dụ: Đức Anh"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-user-email" className="text-sm font-medium text-gray-700">Email</label>
            <input
              id="admin-user-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="Ví dụ: ducanh@ordertower.demo"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-user-role" className="text-sm font-medium text-gray-700">Vai trò</label>
            <select
              id="admin-user-role"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as AdminRole)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">Người dùng mới tạo có trạng thái &quot;Đang hoạt động&quot;, chưa có lần đăng nhập, hiện đầu bảng.</p>
        </div>
      </Modal>

      <Modal
        open={editUser !== null}
        onClose={() => setEditUser(null)}
        title="Sửa vai trò"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitEditRole}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
            >
              Lưu
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            {editUser ? `${editUser.name} - ${editUser.email}` : ""}
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-edit-role" className="text-sm font-medium text-gray-700">Vai trò</label>
            <select
              id="admin-edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as AdminRole)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

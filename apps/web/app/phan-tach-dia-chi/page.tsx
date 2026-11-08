// SPDX-License-Identifier: Apache-2.0

"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ADDRESS_DISTRICTS,
  ADDRESS_PROVINCES,
  ADDRESS_WARDS,
  CONFIRM_ADDRESS_ROWS,
  PENDING_ADDRESS_ROWS,
  allDistricts,
  allWards,
  splitConfLevels,
  trustDotClass,
  trustLevel,
  trustTextClass,
  type AddressTrustLevel,
  type ConfirmAddressRow,
  type ConfirmAddressStatus,
  type PendingAddressRow,
} from "@/data/address-split";

type ModeTab = "pending" | "confirm";
type ConfirmSubTab = "all" | "pending" | "confirmed" | "error";

const MODE_TABS: { key: ModeTab; label: string }[] = [
  { key: "pending", label: "Chờ tách địa chỉ" },
  { key: "confirm", label: "Xác nhận địa chỉ" },
];

const CONFIRM_SUB_TABS: { key: ConfirmSubTab; label: string; status: ConfirmAddressStatus | null }[] = [
  { key: "all", label: "Tất cả", status: null },
  { key: "pending", label: "Chờ xác nhận", status: "Chờ xác nhận" },
  { key: "confirmed", label: "Đã xác nhận", status: "Đã xác nhận" },
  { key: "error", label: "Lỗi phân tách", status: "Lỗi phân tách" },
];

const PAGE_SIZE = 5;
const MANUAL_SPLIT_TRUST = 78;
const AUTO_SPLIT_TRUST = 62;
const DATE_OPTIONS = ["02/11/2026"];

type RowSplit = { province: string; district: string; ward: string };

function MiniSelect({
  id,
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <span className="relative block w-full">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className={`h-8 w-full appearance-none rounded-md border border-gray-300 bg-white pl-2 pr-6 text-xs outline-none focus:border-gray-500 ${
          value === "" ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </span>
  );
}

function FilterSelect({
  id,
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <span className="relative block w-full">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </span>
  );
}

function districtsFor(province: string): string[] {
  return province === "" ? allDistricts() : (ADDRESS_DISTRICTS[province as (typeof ADDRESS_PROVINCES)[number]] ?? []);
}

function wardsFor(district: string): string[] {
  return district === "" ? allWards() : (ADDRESS_WARDS[district] ?? []);
}

export default function AddressSplitPage() {
  const [tab, setTab] = useState<ModeTab>("pending");

  // Cho tach dia chi
  const [pendingRows, setPendingRows] = useState<PendingAddressRow[]>(PENDING_ADDRESS_ROWS);
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(() => new Set(["DH-1061", "DH-1062"]));
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingProvince, setPendingProvince] = useState("");
  const [pendingDistrict, setPendingDistrict] = useState("");
  const [pendingWard, setPendingWard] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingSplits, setPendingSplits] = useState<Record<string, RowSplit>>({});
  const [showPendingAdvanced, setShowPendingAdvanced] = useState(true);

  // Xac nhan dia chi
  const [confirmRows, setConfirmRows] = useState<ConfirmAddressRow[]>(CONFIRM_ADDRESS_ROWS);
  const [confirmSelected, setConfirmSelected] = useState<Set<string>>(() => new Set(["DH-1044", "DH-1038"]));
  const [confirmSearch, setConfirmSearch] = useState("");
  const [confirmTrust, setConfirmTrust] = useState("");
  const [confirmProvince, setConfirmProvince] = useState("");
  const [confirmDistrict, setConfirmDistrict] = useState("");
  const [confirmWard, setConfirmWard] = useState("");
  const [confirmSubTab, setConfirmSubTab] = useState<ConfirmSubTab>("all");
  const [confirmPage, setConfirmPage] = useState(1);
  const [showConfirmAdvanced, setShowConfirmAdvanced] = useState(true);

  // Dialog xac nhan dia chi
  const [dialogRow, setDialogRow] = useState<ConfirmAddressRow | null>(null);
  const [editProvince, setEditProvince] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editWard, setEditWard] = useState("");
  const [editDetail, setEditDetail] = useState("");

  const filteredPending = useMemo(() => {
    const query = pendingSearch.trim().toLowerCase();
    return pendingRows.filter((row) => {
      if (pendingProvince !== "" && row.suggestedProvince !== pendingProvince) return false;
      if (pendingDistrict !== "" && row.suggestedDistrict !== pendingDistrict) return false;
      if (pendingWard !== "" && row.suggestedWard !== pendingWard) return false;
      if (query === "") return true;
      return [row.id, row.customer, row.phone, row.rawAddress].some((value) => value.toLowerCase().includes(query));
    });
  }, [pendingRows, pendingSearch, pendingProvince, pendingDistrict, pendingWard]);

  const pendingTotalPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const pendingSafePage = Math.min(pendingPage, pendingTotalPages);
  const pendingPaged = filteredPending.slice((pendingSafePage - 1) * PAGE_SIZE, pendingSafePage * PAGE_SIZE);
  const pendingRange =
    filteredPending.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (pendingSafePage - 1) * PAGE_SIZE + 1, end: Math.min(pendingSafePage * PAGE_SIZE, filteredPending.length), total: filteredPending.length };

  const pendingSelectedOnPage = pendingPaged.filter((row) => pendingSelected.has(row.id)).length;
  const pendingAllPageSelected = pendingPaged.length > 0 && pendingSelectedOnPage === pendingPaged.length;

  const confirmCounts = useMemo(() => {
    const counts = { all: confirmRows.length, pending: 0, confirmed: 0, error: 0 };
    for (const row of confirmRows) {
      if (row.status === "Chờ xác nhận") counts.pending += 1;
      else if (row.status === "Đã xác nhận") counts.confirmed += 1;
      else counts.error += 1;
    }
    return counts;
  }, [confirmRows]);

  const filteredConfirm = useMemo(() => {
    const query = confirmSearch.trim().toLowerCase();
    const subStatus = CONFIRM_SUB_TABS.find((item) => item.key === confirmSubTab)?.status ?? null;
    return confirmRows.filter((row) => {
      if (subStatus !== null && row.status !== subStatus) return false;
      if (confirmTrust !== "") {
        if (row.trust === null || trustLevel(row.trust) !== (confirmTrust as AddressTrustLevel)) return false;
      }
      if (confirmProvince !== "" && row.province !== confirmProvince) return false;
      if (confirmDistrict !== "" && row.district !== confirmDistrict) return false;
      if (confirmWard !== "" && row.ward !== confirmWard) return false;
      if (query === "") return true;
      return [row.id, row.customer, row.phone, row.rawAddress].some((value) => value.toLowerCase().includes(query));
    });
  }, [confirmRows, confirmSearch, confirmTrust, confirmProvince, confirmDistrict, confirmWard, confirmSubTab]);

  const confirmTotalPages = Math.max(1, Math.ceil(filteredConfirm.length / PAGE_SIZE));
  const confirmSafePage = Math.min(confirmPage, confirmTotalPages);
  const confirmPaged = filteredConfirm.slice((confirmSafePage - 1) * PAGE_SIZE, confirmSafePage * PAGE_SIZE);
  const confirmRange =
    filteredConfirm.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (confirmSafePage - 1) * PAGE_SIZE + 1, end: Math.min(confirmSafePage * PAGE_SIZE, filteredConfirm.length), total: filteredConfirm.length };

  const confirmSelectedOnPage = confirmPaged.filter((row) => confirmSelected.has(row.id)).length;
  const confirmAllPageSelected = confirmPaged.length > 0 && confirmSelectedOnPage === confirmPaged.length;

  const togglePendingOne = (id: string) => {
    setPendingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePendingAllPage = () => {
    setPendingSelected((prev) => {
      const next = new Set(prev);
      if (pendingAllPageSelected) {
        pendingPaged.forEach((row) => next.delete(row.id));
      } else {
        pendingPaged.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const toggleConfirmOne = (id: string) => {
    setConfirmSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleConfirmAllPage = () => {
    setConfirmSelected((prev) => {
      const next = new Set(prev);
      if (confirmAllPageSelected) {
        confirmPaged.forEach((row) => next.delete(row.id));
      } else {
        confirmPaged.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const setPendingSplit = (id: string, patch: Partial<RowSplit>) => {
    setPendingSplits((prev) => {
      const current = prev[id] ?? { province: "", district: "", ward: "" };
      const next = { ...current, ...patch };
      if (patch.province !== undefined) {
        next.district = "";
        next.ward = "";
      }
      if (patch.district !== undefined) {
        next.ward = "";
      }
      return { ...prev, [id]: next };
    });
  };

  const moveToConfirm = (rows: { row: PendingAddressRow; split: RowSplit; trust: number }[]) => {
    const newRows: ConfirmAddressRow[] = rows.map(({ row, split, trust }) => ({
      id: row.id,
      customer: row.customer,
      phone: row.phone,
      rawAddress: row.rawAddress,
      province: split.province,
      district: split.district,
      ward: split.ward,
      detail: row.streetDetail,
      trust,
      status: "Chờ xác nhận",
    }));
    setConfirmRows((prev) => [...newRows, ...prev]);
    const movedIds = new Set(rows.map(({ row }) => row.id));
    setPendingRows((prev) => prev.filter((row) => !movedIds.has(row.id)));
    setPendingSelected((prev) => {
      const next = new Set(prev);
      movedIds.forEach((id) => next.delete(id));
      return next;
    });
    setPendingSplits((prev) => {
      const next = { ...prev };
      movedIds.forEach((id) => delete next[id]);
      return next;
    });
    setPendingPage(1);
    setConfirmSubTab("pending");
    setConfirmPage(1);
    setTab("confirm");
  };

  const splitOne = (row: PendingAddressRow) => {
    const split = pendingSplits[row.id];
    if (!split || split.province === "" || split.district === "" || split.ward === "") return;
    moveToConfirm([{ row, split, trust: MANUAL_SPLIT_TRUST }]);
  };

  const splitSelected = () => {
    const targets = pendingRows
      .filter((row) => pendingSelected.has(row.id))
      .map((row) => ({ row, split: pendingSplits[row.id] }))
      .filter((item) => item.split && item.split.province !== "" && item.split.district !== "" && item.split.ward !== "")
      .map((item) => ({ row: item.row, split: item.split, trust: MANUAL_SPLIT_TRUST }));
    if (targets.length === 0) return;
    moveToConfirm(targets);
  };

  const splitAll = () => {
    if (pendingRows.length === 0) return;
    moveToConfirm(
      pendingRows.map((row) => ({
        row,
        split: { province: row.suggestedProvince, district: row.suggestedDistrict, ward: row.suggestedWard },
        trust: AUTO_SPLIT_TRUST,
      })),
    );
  };

  const confirmSelectedRows = () => {
    const ids = new Set(confirmSelected);
    setConfirmRows((prev) => prev.map((row) => (ids.has(row.id) && row.status === "Chờ xác nhận" ? { ...row, status: "Đã xác nhận" } : row)));
    setConfirmSelected(new Set());
  };

  const updateConfirmSplit = (id: string, patch: Partial<RowSplit>) => {
    setConfirmRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.province !== undefined) {
          next.district = "";
          next.ward = "";
        }
        if (patch.district !== undefined) {
          next.ward = "";
        }
        return next;
      }),
    );
  };

  const openDialog = (row: ConfirmAddressRow) => {
    setDialogRow(row);
    setEditProvince(row.province);
    setEditDistrict(row.district);
    setEditWard(row.ward);
    setEditDetail(row.detail);
  };

  const confirmDialog = () => {
    if (dialogRow === null) return;
    const trust = dialogRow.trust ?? MANUAL_SPLIT_TRUST;
    setConfirmRows((prev) =>
      prev.map((row) =>
        row.id === dialogRow.id
          ? { ...row, province: editProvince, district: editDistrict, ward: editWard, detail: editDetail, status: "Đã xác nhận", trust }
          : row,
      ),
    );
    setDialogRow(null);
  };

  const dialogComplete = editProvince !== "" && editDistrict !== "" && editWard !== "" && editDetail.trim() !== "";
  const dialogLevels = dialogRow !== null && dialogRow.trust !== null ? splitConfLevels(dialogRow.trust) : null;

  const pendingColumns: TableColumn<PendingAddressRow>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn trang này"
          checked={pendingAllPageSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = pendingSelectedOnPage > 0 && !pendingAllPageSelected;
            }
          }}
          onChange={togglePendingAllPage}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${row.id}`}
          checked={pendingSelected.has(row.id)}
          onChange={() => togglePendingOne(row.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "order",
      header: "Đơn/Khách",
      render: (row) => (
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-gray-900">{row.id}</span>
          <span className="text-gray-500">{row.customer}</span>
        </span>
      ),
      headerClassName: "w-[119px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (row) => row.phone,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "raw",
      header: "Địa chỉ gốc",
      render: (row) => row.rawAddress,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[157px]",
    },
    {
      key: "province",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Tỉnh/TP</span>
          <MiniSelect
            value={pendingProvince}
            onChange={(value) => {
              setPendingProvince(value);
              setPendingDistrict("");
              setPendingWard("");
              setPendingPage(1);
            }}
            ariaLabel="Lọc theo tỉnh/thành phố"
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES]}
          />
        </span>
      ),
      render: (row) => {
        const split = pendingSplits[row.id] ?? { province: "", district: "", ward: "" };
        return (
          <MiniSelect
            value={split.province}
            onChange={(value) => setPendingSplit(row.id, { province: value })}
            ariaLabel={`Chọn tỉnh/thành phố cho ${row.id}`}
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES]}
          />
        );
      },
      headerClassName: "h-16 w-[139px]",
    },
    {
      key: "district",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Quận/Huyện</span>
          <MiniSelect
            value={pendingDistrict}
            onChange={(value) => {
              setPendingDistrict(value);
              setPendingWard("");
              setPendingPage(1);
            }}
            ariaLabel="Lọc theo quận/huyện"
            placeholder="Chọn Quận/Huyện"
            options={districtsFor(pendingProvince)}
          />
        </span>
      ),
      render: (row) => {
        const split = pendingSplits[row.id] ?? { province: "", district: "", ward: "" };
        return (
          <MiniSelect
            value={split.district}
            onChange={(value) => setPendingSplit(row.id, { district: value })}
            ariaLabel={`Chọn quận/huyện cho ${row.id}`}
            placeholder="Chọn Quận/Huyện"
            options={districtsFor(split.province)}
          />
        );
      },
      headerClassName: "h-16 w-[139px]",
    },
    {
      key: "ward",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Xã/Phường</span>
          <MiniSelect
            value={pendingWard}
            onChange={(value) => {
              setPendingWard(value);
              setPendingPage(1);
            }}
            ariaLabel="Lọc theo xã/phường"
            placeholder="Chọn Xã/Phường"
            options={wardsFor(pendingDistrict)}
          />
        </span>
      ),
      render: (row) => {
        const split = pendingSplits[row.id] ?? { province: "", district: "", ward: "" };
        return (
          <MiniSelect
            value={split.ward}
            onChange={(value) => setPendingSplit(row.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${row.id}`}
            placeholder="Chọn Xã/Phường"
            options={wardsFor(split.district)}
          />
        );
      },
      headerClassName: "h-16 w-[139px]",
    },
    {
      key: "detail",
      header: "Địa chỉ chi tiết",
      render: (row) => {
        const split = pendingSplits[row.id];
        const complete = split !== undefined && split.province !== "" && split.district !== "" && split.ward !== "";
        return complete ? row.streetDetail : "";
      },
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[139px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: () => "Chờ tách",
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[89px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => {
        const split = pendingSplits[row.id];
        const complete = split !== undefined && split.province !== "" && split.district !== "" && split.ward !== "";
        return (
          <button
            type="button"
            disabled={!complete}
            onClick={() => splitOne(row)}
            title={complete ? "Tách địa chỉ đơn này" : "Chọn đủ tỉnh/thành phố, quận/huyện và xã/phường trước"}
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tách
          </button>
        );
      },
      headerClassName: "w-[79px]",
    },
  ];

  const confirmColumns: TableColumn<ConfirmAddressRow>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn trang này"
          checked={confirmAllPageSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = confirmSelectedOnPage > 0 && !confirmAllPageSelected;
            }
          }}
          onChange={toggleConfirmAllPage}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${row.id}`}
          checked={confirmSelected.has(row.id)}
          onChange={() => toggleConfirmOne(row.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "order",
      header: "Đơn/Khách",
      render: (row) => (
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-gray-900">{row.id}</span>
          <span className="text-gray-500">{row.customer}</span>
        </span>
      ),
      headerClassName: "w-[110px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (row) => row.phone,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[101px]",
    },
    {
      key: "raw",
      header: "Địa chỉ gốc",
      render: (row) => row.rawAddress,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[141px]",
    },
    {
      key: "province",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Tỉnh/TP</span>
          <MiniSelect
            value={confirmProvince}
            onChange={(value) => {
              setConfirmProvince(value);
              setConfirmDistrict("");
              setConfirmWard("");
              setConfirmPage(1);
            }}
            ariaLabel="Lọc theo tỉnh/thành phố"
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES]}
          />
        </span>
      ),
      render: (row) => (
        <MiniSelect
          value={row.province}
          onChange={(value) => updateConfirmSplit(row.id, { province: value })}
          ariaLabel={`Chọn tỉnh/thành phố cho ${row.id}`}
          placeholder="Chọn Tỉnh/TP"
          options={[...ADDRESS_PROVINCES]}
        />
      ),
      headerClassName: "h-16 w-[129px]",
    },
    {
      key: "district",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Quận/Huyện</span>
          <MiniSelect
            value={confirmDistrict}
            onChange={(value) => {
              setConfirmDistrict(value);
              setConfirmWard("");
              setConfirmPage(1);
            }}
            ariaLabel="Lọc theo quận/huyện"
            placeholder="Chọn Quận/Huyện"
            options={districtsFor(confirmProvince)}
          />
        </span>
      ),
      render: (row) => (
        <MiniSelect
          value={row.district}
          onChange={(value) => updateConfirmSplit(row.id, { district: value })}
          ariaLabel={`Chọn quận/huyện cho ${row.id}`}
          placeholder="Chọn Quận/Huyện"
          options={districtsFor(row.province)}
        />
      ),
      headerClassName: "h-16 w-[129px]",
    },
    {
      key: "ward",
      header: (
        <span className="flex flex-col items-start gap-1">
          <span>Xã/Phường</span>
          <MiniSelect
            value={confirmWard}
            onChange={(value) => {
              setConfirmWard(value);
              setConfirmPage(1);
            }}
            ariaLabel="Lọc theo xã/phường"
            placeholder="Chọn Xã/Phường"
            options={wardsFor(confirmDistrict)}
          />
        </span>
      ),
      render: (row) => (
        <MiniSelect
          value={row.ward}
          onChange={(value) => updateConfirmSplit(row.id, { ward: value })}
          ariaLabel={`Chọn xã/phường cho ${row.id}`}
          placeholder="Chọn Xã/Phường"
          options={wardsFor(row.district)}
        />
      ),
      headerClassName: "h-16 w-[129px]",
    },
    {
      key: "detail",
      header: "Địa chỉ chi tiết",
      render: (row) => row.detail,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[129px]",
    },
    {
      key: "trust",
      header: "Độ tin cậy",
      render: (row) =>
        row.trust === null ? (
          <span className="text-xs text-gray-400">-</span>
        ) : (
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${trustDotClass(row.trust)}`} />
            <span className={`text-xs font-bold ${trustTextClass(row.trust)}`}>{row.trust}%</span>
          </span>
        ),
      headerClassName: "w-[83px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => <span className={row.status === "Lỗi phân tách" ? "text-red-700" : undefined}>{row.status}</span>,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[83px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => (
        <button
          type="button"
          onClick={() => openDialog(row)}
          className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800"
        >
          Chi tiết
        </button>
      ),
      headerClassName: "w-[74px]",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-gray-900">Phân tách địa chỉ</h1>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {MODE_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex h-9 items-center justify-center rounded-md px-5 text-sm ${
              tab === item.key ? "bg-white font-bold text-red-800 shadow-sm" : "text-gray-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-[340px] max-w-full">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={pendingSearch}
                  onChange={(event) => {
                    setPendingSearch(event.target.value);
                    setPendingPage(1);
                  }}
                  placeholder="Tìm kiếm mã đơn, địa chỉ..."
                  aria-label="Tìm kiếm mã đơn, địa chỉ chờ tách"
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPendingAdvanced((prev) => !prev)}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Lọc nâng cao
              </button>
            </div>
            {showPendingAdvanced && (
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="pending-date" className="text-sm font-medium text-gray-700">
                    Ngày tạo đơn
                  </label>
                  <FilterSelect id="pending-date" value="02/11/2026" onChange={() => undefined} ariaLabel="Ngày tạo đơn" placeholder="02/11/2026" options={DATE_OPTIONS} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={splitAll}
              disabled={pendingRows.length === 0}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tách tất cả
            </button>
            <p className="text-[13px] text-gray-500">Tách địa chỉ cho các đơn đang chờ, kết quả đưa sang hàng đợi xác nhận.</p>
          </div>

          <section aria-label="Danh sách đơn chờ tách địa chỉ" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {pendingSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <p className="text-sm font-semibold text-gray-600">{pendingSelected.size} dòng đã được chọn</p>
                <button
                  type="button"
                  onClick={splitSelected}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
                >
                  Tách địa chỉ
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSelected(new Set())}
                  className="flex h-9 items-center rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Bỏ chọn
                </button>
              </div>
            )}
            <Table bare columns={pendingColumns} rows={pendingPaged} rowKey={(row) => row.id} emptyText="Không có đơn chờ tách" />
            <div className="border-t border-gray-200">
              <Pagination page={pendingSafePage} totalPages={pendingTotalPages} onPageChange={setPendingPage} range={pendingRange} />
            </div>
          </section>
        </>
      )}

      {tab === "confirm" && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-[340px] max-w-full">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={confirmSearch}
                  onChange={(event) => {
                    setConfirmSearch(event.target.value);
                    setConfirmPage(1);
                  }}
                  placeholder="Tìm kiếm mã đơn, địa chỉ..."
                  aria-label="Tìm kiếm mã đơn, địa chỉ chờ xác nhận"
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmAdvanced((prev) => !prev)}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Lọc nâng cao
              </button>
            </div>
            {showConfirmAdvanced && (
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="confirm-trust" className="text-sm font-medium text-gray-700">
                    Độ tin cậy
                  </label>
                  <FilterSelect
                    id="confirm-trust"
                    value={confirmTrust}
                    onChange={(value) => {
                      setConfirmTrust(value);
                      setConfirmPage(1);
                    }}
                    ariaLabel="Lọc theo độ tin cậy"
                    placeholder="Tất cả độ tin cậy"
                    options={["Rủi ro cao", "Cần lưu ý", "Tin cậy cao"]}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="confirm-province" className="text-sm font-medium text-gray-700">
                    Tỉnh/Thành phố
                  </label>
                  <FilterSelect
                    id="confirm-province"
                    value={confirmProvince}
                    onChange={(value) => {
                      setConfirmProvince(value);
                      setConfirmDistrict("");
                      setConfirmWard("");
                      setConfirmPage(1);
                    }}
                    ariaLabel="Lọc theo tỉnh/thành phố"
                    placeholder="Tất cả tỉnh/thành phố"
                    options={[...ADDRESS_PROVINCES]}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="confirm-date" className="text-sm font-medium text-gray-700">
                    Ngày tạo đơn
                  </label>
                  <FilterSelect id="confirm-date" value="02/11/2026" onChange={() => undefined} ariaLabel="Ngày tạo đơn" placeholder="02/11/2026" options={DATE_OPTIONS} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-1 rounded-lg border border-gray-300 bg-gray-100 px-2 py-1">
            {CONFIRM_SUB_TABS.map((item) => {
              const count =
                item.key === "all" ? confirmCounts.all : item.key === "pending" ? confirmCounts.pending : item.key === "confirmed" ? confirmCounts.confirmed : confirmCounts.error;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setConfirmSubTab(item.key);
                    setConfirmPage(1);
                  }}
                  className={`flex h-9 flex-1 items-center justify-center rounded-md px-5 text-sm ${
                    confirmSubTab === item.key ? "bg-white font-bold text-red-700 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {item.label} ({count})
                </button>
              );
            })}
          </div>

          <section aria-label="Hàng đợi xác nhận địa chỉ" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {confirmSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <p className="text-sm font-semibold text-gray-600">{confirmSelected.size} dòng đã được chọn</p>
                <button
                  type="button"
                  onClick={confirmSelectedRows}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
                >
                  Xác nhận hàng loạt
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSelected(new Set())}
                  className="flex h-9 items-center rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Bỏ chọn
                </button>
              </div>
            )}
            <Table bare columns={confirmColumns} rows={confirmPaged} rowKey={(row) => row.id} emptyText="Không có đơn chờ xác nhận" />
            <div className="border-t border-gray-200">
              <Pagination page={confirmSafePage} totalPages={confirmTotalPages} onPageChange={setConfirmPage} range={confirmRange} />
            </div>
          </section>
        </>
      )}

      <Modal
        open={dialogRow !== null}
        onClose={() => setDialogRow(null)}
        title="Xác nhận & hiệu chỉnh địa chỉ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDialogRow(null)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!dialogComplete}
              onClick={confirmDialog}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận
            </button>
          </>
        }
      >
        {dialogRow !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Khách hàng: {dialogRow.customer} - SĐT: {dialogRow.phone} - {dialogRow.id}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-gray-500">Địa chỉ gốc</p>
              <div className="rounded-lg border border-gray-300 bg-gray-100 p-2 text-sm text-gray-800">
                {dialogRow.detail !== "" ? `${dialogRow.detail}, ${dialogRow.district}, ${dialogRow.province}` : dialogRow.rawAddress}
              </div>
            </div>
            <div className="flex items-start gap-2">
              {(
                [
                  { label: "Tỉnh / TP", value: dialogLevels?.province ?? null },
                  { label: "Quận / Huyện", value: dialogLevels?.district ?? null },
                  { label: "Xã / Phường", value: dialogLevels?.ward ?? null },
                ] as { label: string; value: number | null }[]
              ).map((item) => (
                <div key={item.label} className="flex flex-1 flex-col items-center gap-1 rounded-md border border-gray-100 bg-gray-100 px-2 py-3">
                  <p className="text-xs text-gray-700">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.value === null ? "text-gray-400" : trustTextClass(item.value)}`}>
                    {item.value === null ? "-" : `${item.value}%`}
                  </p>
                  <p className="text-xs text-gray-700">{item.value === null ? "-" : trustLevel(item.value)}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-900">Hiệu chỉnh</p>
              <div className="flex flex-col gap-1">
                <label htmlFor="dialog-province" className="text-sm font-medium text-gray-600">
                  Tỉnh/TP
                </label>
                <MiniSelect
                  id="dialog-province"
                  value={editProvince}
                  onChange={(value) => {
                    setEditProvince(value);
                    setEditDistrict("");
                    setEditWard("");
                  }}
                  ariaLabel="Hiệu chỉnh tỉnh/thành phố"
                  placeholder="Chọn Tỉnh/TP"
                  options={[...ADDRESS_PROVINCES]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="dialog-district" className="text-sm font-medium text-gray-600">
                  Quận/Huyện
                </label>
                <MiniSelect
                  id="dialog-district"
                  value={editDistrict}
                  onChange={(value) => {
                    setEditDistrict(value);
                    setEditWard("");
                  }}
                  ariaLabel="Hiệu chỉnh quận/huyện"
                  placeholder="Chọn Quận/Huyện"
                  options={districtsFor(editProvince)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="dialog-ward" className="text-sm font-medium text-gray-600">
                  Xã/Phường
                </label>
                <MiniSelect
                  id="dialog-ward"
                  value={editWard}
                  onChange={setEditWard}
                  ariaLabel="Hiệu chỉnh xã/phường"
                  placeholder="Chọn Xã/Phường"
                  options={wardsFor(editDistrict)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="dialog-detail" className="text-sm font-medium text-gray-600">
                Địa chỉ chi tiết
              </label>
              <input
                id="dialog-detail"
                type="text"
                value={editDetail}
                onChange={(event) => setEditDetail(event.target.value)}
                placeholder="Số nhà, ngõ, đường..."
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-500"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

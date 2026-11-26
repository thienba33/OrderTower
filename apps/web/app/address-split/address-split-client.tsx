// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ADDRESS_DISTRICTS,
  ADDRESS_PROVINCES,
  ADDRESS_WARDS,
  allDistricts,
  allWards,
  splitConfLevels,
  trustDotClass,
  trustLevel,
  trustTextClass,
  type AddressTrustLevel,
} from "@/data/address-split";
import type { ApiOrderDetail } from "../orders/[id]/order-detail-types";
import type { RowSplit } from "./address-split-types";

type ModeTab = "pending" | "confirm";

const MODE_TABS: { key: ModeTab; label: string }[] = [
  { key: "pending", label: "Chờ tách địa chỉ" },
  { key: "confirm", label: "Xác nhận địa chỉ" },
];

const PAGE_SIZE = 5;

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

// Địa chỉ nối đủ cấp, thiếu thì "-".
function joinAddress(order: ApiOrderDetail): string {
  const parts = [
    order.address?.street,
    order.address?.ward,
    order.address?.district,
    order.address?.province,
  ].filter((part) => part !== undefined && part.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : "-";
}

function trustLabel(order: ApiOrderDetail): string {
  if (order.addressTrust === null) return "-";
  const level = order.addressLevel ?? trustLevel(order.addressTrust);
  return `${order.addressTrust}% - ${level}`;
}

// Điền sẵn các cấp địa chỉ đơn đã có; cấp nào không nằm trong hằng số
// địa lý (API cũng không chấm) thì để trống cho người dùng chọn.
function prefilledSplit(order: ApiOrderDetail): RowSplit {
  const province =
    order.address?.province !== undefined && (ADDRESS_PROVINCES as readonly string[]).includes(order.address.province)
      ? order.address.province
      : "";
  const district =
    province !== "" &&
    order.address?.district !== undefined &&
    (ADDRESS_DISTRICTS[province as (typeof ADDRESS_PROVINCES)[number]] ?? []).includes(order.address.district)
      ? order.address.district
      : "";
  const ward =
    district !== "" && order.address?.ward !== undefined && (ADDRESS_WARDS[district] ?? []).includes(order.address.ward)
      ? order.address.ward
      : "";
  return { province, district, ward, street: order.address?.street ?? "" };
}

function splitComplete(split: RowSplit): boolean {
  return split.province !== "" && split.district !== "" && split.ward !== "";
}

export default function AddressSplitClient({ orders }: { orders: ApiOrderDetail[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<ModeTab>("pending");

  // Đơn chờ tách: tin cậy dưới 70, hoặc chưa có địa chỉ để chấm. Đơn
  // đã tách xong (tin cậy từ 70) sang tab xác nhận.
  const pendingOrders = useMemo(
    () => orders.filter((order) => order.addressTrust === null || order.addressTrust < 70),
    [orders],
  );
  const confirmOrders = useMemo(
    () => orders.filter((order) => order.addressTrust !== null && order.addressTrust >= 70),
    [orders],
  );

  // Cho tach dia chi
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingProvince, setPendingProvince] = useState("");
  const [pendingDistrict, setPendingDistrict] = useState("");
  const [pendingWard, setPendingWard] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingSplits, setPendingSplits] = useState<Record<string, RowSplit>>({});
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // Xac nhan dia chi
  const [confirmSearch, setConfirmSearch] = useState("");
  const [confirmTrust, setConfirmTrust] = useState("");
  const [confirmProvince, setConfirmProvince] = useState("");
  const [confirmDistrict, setConfirmDistrict] = useState("");
  const [confirmWard, setConfirmWard] = useState("");
  const [confirmPage, setConfirmPage] = useState(1);
  const [showConfirmAdvanced, setShowConfirmAdvanced] = useState(true);
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, RowSplit>>({});

  // Dialog xac nhan dia chi
  const [dialogOrder, setDialogOrder] = useState<ApiOrderDetail | null>(null);
  const [editProvince, setEditProvince] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editWard, setEditWard] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const splitFor = (order: ApiOrderDetail): RowSplit => pendingSplits[order.id] ?? prefilledSplit(order);

  const filteredPending = useMemo(() => {
    const query = pendingSearch.trim().toLowerCase();
    return pendingOrders.filter((order) => {
      if (pendingProvince !== "" && order.address?.province !== pendingProvince) return false;
      if (pendingDistrict !== "" && order.address?.district !== pendingDistrict) return false;
      if (pendingWard !== "" && order.address?.ward !== pendingWard) return false;
      if (query === "") return true;
      return [order.id, order.customer, order.phone ?? "", joinAddress(order)].some((value) => value.toLowerCase().includes(query));
    });
  }, [pendingOrders, pendingSearch, pendingProvince, pendingDistrict, pendingWard]);

  const pendingTotalPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const pendingSafePage = Math.min(pendingPage, pendingTotalPages);
  const pendingPaged = filteredPending.slice((pendingSafePage - 1) * PAGE_SIZE, pendingSafePage * PAGE_SIZE);
  const pendingRange =
    filteredPending.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (pendingSafePage - 1) * PAGE_SIZE + 1, end: Math.min(pendingSafePage * PAGE_SIZE, filteredPending.length), total: filteredPending.length };

  const pendingSelectedOnPage = pendingPaged.filter((order) => pendingSelected.has(order.id)).length;
  const pendingAllPageSelected = pendingPaged.length > 0 && pendingSelectedOnPage === pendingPaged.length;

  const filteredConfirm = useMemo(() => {
    const query = confirmSearch.trim().toLowerCase();
    return confirmOrders.filter((order) => {
      if (confirmTrust !== "") {
        if (order.addressTrust === null || trustLevel(order.addressTrust) !== (confirmTrust as AddressTrustLevel)) return false;
      }
      if (confirmProvince !== "" && order.address?.province !== confirmProvince) return false;
      if (confirmDistrict !== "" && order.address?.district !== confirmDistrict) return false;
      if (confirmWard !== "" && order.address?.ward !== confirmWard) return false;
      if (query === "") return true;
      return [order.id, order.customer, order.phone ?? "", joinAddress(order)].some((value) => value.toLowerCase().includes(query));
    });
  }, [confirmOrders, confirmSearch, confirmTrust, confirmProvince, confirmDistrict, confirmWard]);

  const confirmTotalPages = Math.max(1, Math.ceil(filteredConfirm.length / PAGE_SIZE));
  const confirmSafePage = Math.min(confirmPage, confirmTotalPages);
  const confirmPaged = filteredConfirm.slice((confirmSafePage - 1) * PAGE_SIZE, confirmSafePage * PAGE_SIZE);
  const confirmRange =
    filteredConfirm.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (confirmSafePage - 1) * PAGE_SIZE + 1, end: Math.min(confirmSafePage * PAGE_SIZE, filteredConfirm.length), total: filteredConfirm.length };

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
        pendingPaged.forEach((order) => next.delete(order.id));
      } else {
        pendingPaged.forEach((order) => next.add(order.id));
      }
      return next;
    });
  };

  const setPendingSplit = (id: string, patch: Partial<RowSplit>) => {
    setPendingSplits((prev) => {
      const order = pendingOrders.find((item) => item.id === id);
      const current = prev[id] ?? (order ? prefilledSplit(order) : { province: "", district: "", ward: "", street: "" });
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

  // Gửi toàn bộ địa chỉ đã tách lên API; API thay địa chỉ cũ và tính
  // lại tin cậy ngay. Trả về tin cậy mới khi thành công.
  const patchAddress = async (id: string, split: RowSplit): Promise<{ ok: true; trust: number | null } | { ok: false; message: string }> => {
    const street = split.street.trim();
    let response: Response;
    try {
      response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: {
            province: split.province,
            district: split.district,
            ward: split.ward,
            ...(street === "" ? {} : { street }),
          },
        }),
      });
    } catch {
      return { ok: false, message: "Không gọi được API." };
    }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Rơi xuống thông báo mặc định ở dưới.
    }
    if (!response.ok) {
      const message = (data as Record<string, unknown> | null)?.message;
      if (typeof message === "string" && message.length > 0) {
        return { ok: false, message };
      }
      return { ok: false, message: `API trả về ${response.status}.` };
    }
    const trust = (data as Record<string, unknown> | null)?.addressTrust;
    return { ok: true, trust: typeof trust === "number" ? trust : null };
  };

  const splitOne = async (order: ApiOrderDetail) => {
    const split = splitFor(order);
    if (!splitComplete(split) || pendingBusy) return;
    setPendingBusy(true);
    setPendingNote(null);
    setPendingError(null);
    const result = await patchAddress(order.id, split);
    setPendingBusy(false);
    if (!result.ok) {
      setPendingError(`Đơn ${order.id}: ${result.message}`);
      return;
    }
    setPendingNote(`Đã tách ${order.id}, tin cậy mới ${result.trust === null ? "-" : `${result.trust}%`}.`);
    router.refresh();
  };

  // Tách tuần tự từng đơn đã chọn mà đã đủ 3 cấp; dừng ở lỗi đầu tiên.
  // Đơn chưa đủ 3 cấp thì bỏ qua kèm ghi chú.
  const splitSelected = async () => {
    if (pendingBusy) return;
    const targets = pendingOrders.filter((order) => pendingSelected.has(order.id));
    if (targets.length === 0) return;
    setPendingBusy(true);
    setPendingNote(null);
    setPendingError(null);
    let done = 0;
    const skipped: string[] = [];
    let stoppedAt: string | null = null;
    for (const order of targets) {
      const split = splitFor(order);
      if (!splitComplete(split)) {
        skipped.push(order.id);
        continue;
      }
      const result = await patchAddress(order.id, split);
      if (!result.ok) {
        stoppedAt = `Đơn ${order.id}: ${result.message}`;
        break;
      }
      done += 1;
    }
    setPendingBusy(false);
    if (stoppedAt !== null) {
      setPendingError(stoppedAt);
    }
    const parts: string[] = [];
    if (done > 0) parts.push(`Đã tách ${done} đơn.`);
    if (skipped.length > 0) parts.push(`Bỏ qua ${skipped.length} đơn chưa đủ 3 cấp: ${skipped.join(", ")}.`);
    if (parts.length > 0) setPendingNote(parts.join(" "));
    setPendingSelected(new Set());
    router.refresh();
  };

  const draftFor = (order: ApiOrderDetail): RowSplit => confirmDrafts[order.id] ?? prefilledSplit(order);

  const setConfirmDraft = (id: string, patch: Partial<RowSplit>) => {
    setConfirmDrafts((prev) => {
      const order = confirmOrders.find((item) => item.id === id);
      const current = prev[id] ?? (order ? prefilledSplit(order) : { province: "", district: "", ward: "", street: "" });
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

  const openDialog = (order: ApiOrderDetail) => {
    const draft = draftFor(order);
    setDialogOrder(order);
    setEditProvince(draft.province);
    setEditDistrict(draft.district);
    setEditWard(draft.ward);
    setEditDetail(draft.street);
    setDialogError(null);
  };

  const confirmDialog = async () => {
    if (dialogOrder === null || dialogBusy) return;
    const split: RowSplit = { province: editProvince, district: editDistrict, ward: editWard, street: editDetail };
    if (!splitComplete(split) || editDetail.trim() === "") return;
    setDialogBusy(true);
    setDialogError(null);
    const result = await patchAddress(dialogOrder.id, split);
    setDialogBusy(false);
    if (!result.ok) {
      setDialogError(result.message);
      return;
    }
    setDialogOrder(null);
    router.refresh();
  };

  const dialogComplete = editProvince !== "" && editDistrict !== "" && editWard !== "" && editDetail.trim() !== "";
  const dialogLevels = dialogOrder !== null && dialogOrder.addressTrust !== null ? splitConfLevels(dialogOrder.addressTrust) : null;

  const pendingColumns: TableColumn<ApiOrderDetail>[] = [
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
      render: (order) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${order.id}`}
          checked={pendingSelected.has(order.id)}
          onChange={() => togglePendingOne(order.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "order",
      header: "Đơn/Khách",
      render: (order) => (
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-gray-900">{order.id}</span>
          <span className="text-gray-500">{order.customer}</span>
        </span>
      ),
      headerClassName: "w-[119px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (order) => order.phone ?? "-",
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "raw",
      header: "Địa chỉ hiện tại",
      render: (order) => joinAddress(order),
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
      render: (order) => {
        const split = splitFor(order);
        return (
          <MiniSelect
            value={split.province}
            onChange={(value) => setPendingSplit(order.id, { province: value })}
            ariaLabel={`Chọn tỉnh/thành phố cho ${order.id}`}
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
      render: (order) => {
        const split = splitFor(order);
        return (
          <MiniSelect
            value={split.district}
            onChange={(value) => setPendingSplit(order.id, { district: value })}
            ariaLabel={`Chọn quận/huyện cho ${order.id}`}
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
      render: (order) => {
        const split = splitFor(order);
        return (
          <MiniSelect
            value={split.ward}
            onChange={(value) => setPendingSplit(order.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${order.id}`}
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
      render: (order) => {
        const split = splitFor(order);
        return (
          <input
            type="text"
            value={split.street}
            onChange={(event) => setPendingSplit(order.id, { street: event.target.value })}
            aria-label={`Địa chỉ chi tiết cho ${order.id}`}
            placeholder="Số nhà, ngõ, đường..."
            className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-500"
          />
        );
      },
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[139px]",
    },
    {
      key: "trust",
      header: "Độ tin cậy",
      render: (order) =>
        order.addressTrust === null ? (
          <span className="text-xs text-gray-400">-</span>
        ) : (
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${trustDotClass(order.addressTrust)}`} />
            <span className={`text-xs font-bold ${trustTextClass(order.addressTrust)}`}>{trustLabel(order)}</span>
          </span>
        ),
      headerClassName: "w-[119px]",
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
      render: (order) => {
        const complete = splitComplete(splitFor(order));
        return (
          <button
            type="button"
            disabled={!complete || pendingBusy}
            onClick={() => splitOne(order)}
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

  const confirmColumns: TableColumn<ApiOrderDetail>[] = [
    {
      key: "order",
      header: "Đơn/Khách",
      render: (order) => (
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-gray-900">{order.id}</span>
          <span className="text-gray-500">{order.customer}</span>
        </span>
      ),
      headerClassName: "w-[110px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (order) => order.phone ?? "-",
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[101px]",
    },
    {
      key: "raw",
      header: "Địa chỉ hiện tại",
      render: (order) => joinAddress(order),
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
      render: (order) => {
        const draft = draftFor(order);
        return (
          <MiniSelect
            value={draft.province}
            onChange={(value) => setConfirmDraft(order.id, { province: value })}
            ariaLabel={`Chọn tỉnh/thành phố cho ${order.id}`}
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES]}
          />
        );
      },
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
      render: (order) => {
        const draft = draftFor(order);
        return (
          <MiniSelect
            value={draft.district}
            onChange={(value) => setConfirmDraft(order.id, { district: value })}
            ariaLabel={`Chọn quận/huyện cho ${order.id}`}
            placeholder="Chọn Quận/Huyện"
            options={districtsFor(draft.province)}
          />
        );
      },
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
      render: (order) => {
        const draft = draftFor(order);
        return (
          <MiniSelect
            value={draft.ward}
            onChange={(value) => setConfirmDraft(order.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${order.id}`}
            placeholder="Chọn Xã/Phường"
            options={wardsFor(draft.district)}
          />
        );
      },
      headerClassName: "h-16 w-[129px]",
    },
    {
      key: "detail",
      header: "Địa chỉ chi tiết",
      render: (order) => order.address?.street ?? "-",
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[129px]",
    },
    {
      key: "trust",
      header: "Độ tin cậy",
      render: (order) =>
        order.addressTrust === null ? (
          <span className="text-xs text-gray-400">-</span>
        ) : (
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${trustDotClass(order.addressTrust)}`} />
            <span className={`text-xs font-bold ${trustTextClass(order.addressTrust)}`}>{trustLabel(order)}</span>
          </span>
        ),
      headerClassName: "w-[129px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (order) => (
        <button
          type="button"
          onClick={() => openDialog(order)}
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={splitSelected}
              disabled={pendingSelected.size === 0 || pendingBusy}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tách tất cả
            </button>
            <p className="text-[13px] text-gray-500">Tách địa chỉ cho các đơn đã chọn, tin cậy mới do API tính lại.</p>
          </div>
          {pendingNote !== null && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{pendingNote}</p>
          )}
          {pendingError !== null && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{pendingError}</p>
          )}

          <section aria-label="Danh sách đơn chờ tách địa chỉ" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {pendingSelected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <p className="text-sm font-semibold text-gray-600">{pendingSelected.size} dòng đã được chọn</p>
                <button
                  type="button"
                  onClick={splitSelected}
                  disabled={pendingBusy}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
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
            <Table bare columns={pendingColumns} rows={pendingPaged} rowKey={(order) => order.id} emptyText="Không có đơn chờ tách" />
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
              </div>
            )}
          </div>

          <section aria-label="Hàng đợi xác nhận địa chỉ" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <Table bare columns={confirmColumns} rows={confirmPaged} rowKey={(order) => order.id} emptyText="Không có đơn đã tách xong" />
            <div className="border-t border-gray-200">
              <Pagination page={confirmSafePage} totalPages={confirmTotalPages} onPageChange={setConfirmPage} range={confirmRange} />
            </div>
          </section>
        </>
      )}

      <Modal
        open={dialogOrder !== null}
        onClose={() => setDialogOrder(null)}
        title="Xác nhận & hiệu chỉnh địa chỉ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDialogOrder(null)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!dialogComplete || dialogBusy}
              onClick={confirmDialog}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận
            </button>
          </>
        }
      >
        {dialogOrder !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Khách hàng: {dialogOrder.customer} - SĐT: {dialogOrder.phone ?? "-"} - {dialogOrder.id}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-gray-500">Địa chỉ hiện tại</p>
              <div className="rounded-lg border border-gray-300 bg-gray-100 p-2 text-sm text-gray-800">{joinAddress(dialogOrder)}</div>
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
            <p className="text-xs text-gray-500">Lưu địa chỉ đã hiệu chỉnh, API tính lại tin cậy ngay. Không có trạng thái xác nhận riêng ở API.</p>
            {dialogError !== null && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{dialogError}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

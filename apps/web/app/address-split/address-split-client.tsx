// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  ADDRESS_PROVINCES_2025,
  wardsForProvince,
} from "@/data/address-gazetteer-2025";
import {
  trustDotClass,
  trustLevel,
  trustTextClass,
  type AddressTrustLevel,
} from "@/data/address-split";
import type { ApiOrderDetail } from "../orders/[id]/order-detail-types";
import type { ApiWorkflowTransition } from "../orders/[id]/order-detail-types";
import type {
  AddressProposal,
  RowSplit,
  SuggestResponse,
} from "./address-split-types";

type ModeTab = "pending" | "confirm" | "error";

const MODE_TABS: { key: ModeTab; label: string }[] = [
  { key: "pending", label: "Chờ tách địa chỉ" },
  { key: "confirm", label: "Xác nhận địa chỉ" },
  { key: "error", label: "Lỗi phân tách" },
];

// Thứ tự sắp xếp ở tab xác nhận: mặc định tin cậy thấp trước để đơn
// cần xem lại (80, "Cần lưu ý") lên đầu.
const CONFIRM_SORT_OPTIONS: string[] = [
  "Tin cậy thấp trước",
  "Tin cậy cao trước",
  "Hạn giao sớm trước",
  "Mã đơn A-Z",
  "Mã đơn Z-A",
];

const PAGE_SIZE = 5;

// Tối đa 20 đơn mỗi lần bấm "AI phân tách", để không spam API.
const AI_SUGGEST_ALL_LIMIT = 20;

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

// Dropdown xã/phường có ô tìm kiếm: ô nhập lọc theo chuỗi gõ (không phân
// biệt dấu), danh sách gợi ý là datalist của trình duyệt nên không bị cắt
// trong bảng cuộn như dropdown tự vẽ. Chỉ nhận giá trị trong danh mục;
// gõ linh tinh rồi rời ô thì trả về giá trị cũ.
function SearchableSelect({
  id,
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
  small,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: string[];
  small?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const folded = (input: string) =>
    input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const query = text.trim();
  const shown =
    query === ""
      ? options
      : options.filter(
          (option) =>
            folded(option).includes(folded(query)) ||
            option.toLowerCase().includes(query.toLowerCase()),
        );
  return (
    <span className="relative block w-full">
      <input
        id={id}
        list={listId}
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next === "" || options.includes(next)) {
            onChange(next);
          }
        }}
        onBlur={() => {
          if (text !== "" && !options.includes(text)) {
            setText(value);
          }
        }}
        aria-label={ariaLabel}
        placeholder={disabled ? "Chọn tỉnh/thành phố trước" : placeholder}
        className={`w-full rounded-md border border-gray-300 bg-white outline-none focus:border-gray-500 disabled:cursor-not-allowed disabled:bg-gray-100 ${
          small ? "h-8 pl-2 pr-6 text-xs" : "h-10 pl-3 pr-8 text-sm"
        } ${value === "" ? "placeholder:text-gray-400" : "text-gray-700"}`}
      />
      <datalist id={listId}>
        {shown.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <ChevronDown
        size={small ? 12 : 16}
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </span>
  );
}

// Địa chỉ nối đủ cấp, thiếu thì "-". Ưu tiên phần đã tách (địa chỉ hiện
// tại sau khi tách); đơn chưa tách chỉ lưu chuỗi thô khách ghi thì hiện
// đúng chuỗi đó. Quận/huyện cũ vẫn hiện ở dạng chỉ đọc khi đơn còn lưu
// trường đó.
function joinAddress(order: ApiOrderDetail): string {
  const parts = [
    order.address?.street,
    order.address?.ward,
    order.address?.district,
    order.address?.province,
  ].filter((part) => part !== undefined && part.trim() !== "");
  if (parts.length > 0) return parts.join(", ");
  if (order.address?.raw !== undefined && order.address.raw.trim() !== "") {
    return order.address.raw;
  }
  return "-";
}

function trustLabel(order: ApiOrderDetail): string {
  if (order.addressTrust === null) return "-";
  const level = order.addressLevel ?? trustLevel(order.addressTrust);
  return `${order.addressTrust}% - ${level}`;
}

// Điền sẵn các cấp địa chỉ đơn đã có; cấp nào không nằm trong danh mục
// mới (API cũng không chấm) thì để trống cho người dùng chọn.
function prefilledSplit(order: ApiOrderDetail): RowSplit {
  const province =
    order.address?.province !== undefined &&
    (ADDRESS_PROVINCES_2025 as readonly string[]).includes(order.address.province)
      ? order.address.province
      : "";
  const ward =
    province !== "" &&
    order.address?.ward !== undefined &&
    wardsForProvince(province).includes(order.address.ward)
      ? order.address.ward
      : "";
  return { province, ward, street: order.address?.street ?? "" };
}

function splitComplete(split: RowSplit): boolean {
  return split.province !== "" && split.ward !== "";
}

// Địa chỉ đề xuất nối đủ phần để hiển thị trong dòng và modal.
function formatSuggested(address: {
  province?: string;
  ward?: string;
  street?: string;
}): string {
  const parts = [address.street, address.ward, address.province].filter(
    (part) => part !== undefined && part.trim() !== "",
  );
  return parts.length > 0 ? parts.join(", ") : "-";
}

// Lấy message từ lỗi API ({message} là chuỗi hoặc mảng chuỗi).
function parseApiMessage(data: unknown, fallback: string): string {
  const message = (data as Record<string, unknown> | null)?.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  if (Array.isArray(message)) {
    const text = message.filter((item) => typeof item === "string").join("; ");
    if (text.length > 0) {
      return text;
    }
  }
  return fallback;
}

function AiResult({
  suggestion,
  onReview,
}: {
  suggestion: SuggestResponse;
  onReview: () => void;
}) {
  const afterAddress = formatSuggested(suggestion.after.address);
  if (suggestion.applied) {
    return (
      <p className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-800">
        Đã tự áp dụng, tin cậy {suggestion.before.trust}% -&gt;{" "}
        {suggestion.after.trust}%. Xem audit.
      </p>
    );
  }
  if (suggestion.proposal) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-xs text-gray-700">
        <p>
          <span className="font-semibold">Đề xuất ({suggestion.proposal.id}):</span>{" "}
          {afterAddress}
        </p>
        <p>
          Tin cậy {suggestion.before.trust}% -&gt; {suggestion.after.trust}%.
        </p>
        <ul className="list-disc pl-4">
          {suggestion.after.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onReview}
          className="mt-1 flex h-7 w-fit items-center rounded-md bg-red-700 px-2 text-xs font-medium text-white hover:bg-red-800"
        >
          Duyệt
        </button>
      </div>
    );
  }
  if (suggestion.splitError) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-gray-700">
        <p className="font-semibold text-red-800">Lỗi phân tách.</p>
        <p>{suggestion.splitError.message}</p>
        <ul className="list-disc pl-4">
          {suggestion.after.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
        <p>Sửa tay ở tab Lỗi phân tách.</p>
      </div>
    );
  }
  if (suggestion.choices) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-gray-700">
        <p className="font-semibold text-red-800">Mức thấp, nhập tay.</p>
        <ul className="list-disc pl-4">
          {suggestion.after.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
        <p>
          Phường đúng của tỉnh:{" "}
          {suggestion.choices.wards.slice(0, 8).join(", ")}
          {suggestion.choices.wards.length > 8
            ? ` và ${suggestion.choices.wards.length - 8} phường khác`
            : ""}
          .
        </p>
      </div>
    );
  }
  return (
    <p className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
      {suggestion.note ?? "Không có đề xuất."}
    </p>
  );
}

export default function AddressSplitClient({
  orders,
  transitions,
  roles,
}: {
  orders: ApiOrderDetail[];
  transitions: ApiWorkflowTransition[];
  roles: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ModeTab>("pending");

  // Bước tiếp theo của 1 đơn theo định nghĩa luồng: chuyển mà vai của
  // người dùng được làm, bỏ qua Hủy. Đơn đã qua bước địa chỉ (Chờ kho
  // trở đi) không có bước tiếp theo ở đây nên không có checkbox. Luồng
  // yêu cầu vai Điều phối viên cho 2 chuyển Mới tạo -> Đã kiểm tra và
  // Đã kiểm tra -> Chờ kho, nên Quản trị viên/CSKH không xác nhận được.
  const forwardTransitionFor = (
    order: ApiOrderDetail,
  ): ApiWorkflowTransition | undefined => {
    const found = transitions.find(
      (transition) =>
        transition.from === order.state &&
        roles.includes(transition.role) &&
        transition.to !== "Hủy",
    );
    if (!found) return undefined;
    // Hai chuyển có rào chắn tin cậy địa chỉ (Mới tạo -> Đã kiểm tra,
    // Đã kiểm tra -> Chờ kho) yêu cầu tin cậy từ 70. Đơn tin cậy thấp
    // vẫn ở tab Xác nhận để sửa tay, nhưng chưa đủ điều kiện xác nhận
    // hàng loạt cho tới khi sửa xong (nếu không, API chặn và cả đợt
    // xác nhận dừng lại ở đơn đó).
    if (
      (found.from === "Mới tạo" && found.to === "Đã kiểm tra") ||
      (found.from === "Đã kiểm tra" && found.to === "Chờ kho")
    ) {
      if (order.addressTrust === null || order.addressTrust < 70) {
        return undefined;
      }
    }
    return found;
  };

  // Đơn chờ tách: chưa tách, chưa chấm điểm (tin cậy null, không có lỗi
  // phân tách). Đơn đổ về chưa làm gì hết thì nằm ở đây với đúng địa chỉ
  // thô khách ghi. Đơn đã tách xong (có tin cậy) sang tab xác nhận, kể cả
  // tin cậy thấp để xác nhận lại; chỉ đơn tách bị lỗi mới sang tab lỗi
  // phân tách.
  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.addressTrust === null &&
          (order.address?.splitError === undefined || order.address.splitError === null),
      ),
    [orders],
  );
  const confirmOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.addressTrust !== null &&
          (order.address?.splitError === undefined || order.address.splitError === null),
      ),
    [orders],
  );
  // Đơn lỗi phân tách: chỉ đơn tách bị lỗi (có splitError đã lưu) hoặc địa
  // chỉ linh tinh không nhận dạng được. Đơn địa chỉ ổn nhưng tin cậy thấp
  // vẫn ở tab Xác nhận để xác nhận lại tiếp, không về tab lỗi.
  const splitErrorOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.address?.splitError !== undefined && order.address.splitError !== null,
      ),
    [orders],
  );

  // Lỗi phân tách: phân trang giống 2 tab còn lại.
  const [errorPage, setErrorPage] = useState(1);

  // Cho tach dia chi
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingProvince, setPendingProvince] = useState("");
  const [pendingWard, setPendingWard] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingSplits, setPendingSplits] = useState<Record<string, RowSplit>>({});
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // AI phân tách địa chỉ (AI số 1): dùng chuỗi thô đã lưu trên đơn,
  // kết quả đề xuất giữ theo mã đơn; modal duyệt giữ đề xuất đang mở
  // kèm địa chỉ đã hiệu chỉnh và lý do.
  const [suggestions, setSuggestions] = useState<Record<string, SuggestResponse>>({});
  const [suggestErrors, setSuggestErrors] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<Record<string, boolean>>({});
  const [aiAllBusy, setAiAllBusy] = useState(false);
  const [aiModal, setAiModal] = useState<{
    order: ApiOrderDetail;
    response: SuggestResponse;
  } | null>(null);
  const [aiEditProvince, setAiEditProvince] = useState("");
  const [aiEditWard, setAiEditWard] = useState("");
  const [aiEditStreet, setAiEditStreet] = useState("");
  const [aiReason, setAiReason] = useState("");
  const [aiModalBusy, setAiModalBusy] = useState(false);
  const [aiModalError, setAiModalError] = useState<string | null>(null);

  // Xac nhan dia chi
  const [confirmSearch, setConfirmSearch] = useState("");
  const [confirmTrust, setConfirmTrust] = useState("");
  const [confirmProvince, setConfirmProvince] = useState("");
  const [confirmWard, setConfirmWard] = useState("");
  const [confirmSort, setConfirmSort] = useState(CONFIRM_SORT_OPTIONS[0]);
  const [confirmPage, setConfirmPage] = useState(1);
  const [showConfirmAdvanced, setShowConfirmAdvanced] = useState(true);
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, RowSplit>>({});

  // Xác nhận hàng loạt: chuyển các đơn đã chọn sang bước tiếp theo.
  const [confirmSelected, setConfirmSelected] = useState<Set<string>>(new Set());
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Dialog xac nhan dia chi
  const [dialogOrder, setDialogOrder] = useState<ApiOrderDetail | null>(null);
  const [editProvince, setEditProvince] = useState("");
  const [editWard, setEditWard] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const splitFor = (order: ApiOrderDetail): RowSplit => pendingSplits[order.id] ?? prefilledSplit(order);

  const filteredPending = useMemo(() => {
    const query = pendingSearch.trim().toLowerCase();
    return pendingOrders.filter((order) => {
      if (pendingProvince !== "" && order.address?.province !== pendingProvince) return false;
      if (pendingWard !== "" && order.address?.ward !== pendingWard) return false;
      if (query === "") return true;
      return [order.id, order.customer, order.phone ?? "", joinAddress(order)].some((value) => value.toLowerCase().includes(query));
    });
  }, [pendingOrders, pendingSearch, pendingProvince, pendingWard]);

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
    const filtered = confirmOrders.filter((order) => {
      if (confirmTrust !== "") {
        if (order.addressTrust === null || trustLevel(order.addressTrust) !== (confirmTrust as AddressTrustLevel)) return false;
      }
      if (confirmProvince !== "" && order.address?.province !== confirmProvince) return false;
      if (confirmWard !== "" && order.address?.ward !== confirmWard) return false;
      if (query === "") return true;
      return [order.id, order.customer, order.phone ?? "", joinAddress(order)].some((value) => value.toLowerCase().includes(query));
    });
    const sorted = [...filtered];
    if (confirmSort === "Tin cậy cao trước") {
      sorted.sort((a, b) => (b.addressTrust ?? -1) - (a.addressTrust ?? -1) || a.id.localeCompare(b.id));
    } else if (confirmSort === "Hạn giao sớm trước") {
      sorted.sort((a, b) => {
        if (a.deadline === null && b.deadline === null) return a.id.localeCompare(b.id);
        if (a.deadline === null) return 1;
        if (b.deadline === null) return -1;
        return a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id);
      });
    } else if (confirmSort === "Mã đơn A-Z") {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
    } else if (confirmSort === "Mã đơn Z-A") {
      sorted.sort((a, b) => b.id.localeCompare(a.id));
    } else {
      // "Tin cậy thấp trước" (mặc định): đơn cần xem lại lên đầu.
      sorted.sort((a, b) => (a.addressTrust ?? -1) - (b.addressTrust ?? -1) || a.id.localeCompare(b.id));
    }
    return sorted;
  }, [confirmOrders, confirmSearch, confirmTrust, confirmProvince, confirmWard, confirmSort]);

  const confirmTotalPages = Math.max(1, Math.ceil(filteredConfirm.length / PAGE_SIZE));
  const confirmSafePage = Math.min(confirmPage, confirmTotalPages);
  const confirmPaged = filteredConfirm.slice((confirmSafePage - 1) * PAGE_SIZE, confirmSafePage * PAGE_SIZE);
  const confirmRange =
    filteredConfirm.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (confirmSafePage - 1) * PAGE_SIZE + 1, end: Math.min(confirmSafePage * PAGE_SIZE, filteredConfirm.length), total: filteredConfirm.length };

  const errorTotalPages = Math.max(1, Math.ceil(splitErrorOrders.length / PAGE_SIZE));
  const errorSafePage = Math.min(errorPage, errorTotalPages);
  const errorPaged = splitErrorOrders.slice((errorSafePage - 1) * PAGE_SIZE, errorSafePage * PAGE_SIZE);
  const errorRange =
    splitErrorOrders.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (errorSafePage - 1) * PAGE_SIZE + 1, end: Math.min(errorSafePage * PAGE_SIZE, splitErrorOrders.length), total: splitErrorOrders.length };

  // Chỉ đơn có bước tiếp theo mà vai hiện tại làm được mới chọn để xác
  // nhận hàng loạt. "Chọn tất cả" chỉ chọn các đơn đủ điều kiện trên
  // trang này, không chọn đơn đã qua bước địa chỉ.
  const confirmEligiblePaged = confirmPaged.filter(
    (order) => forwardTransitionFor(order) !== undefined,
  );
  const confirmSelectedOnPage = confirmEligiblePaged.filter((order) =>
    confirmSelected.has(order.id),
  ).length;
  const confirmAllPageSelected =
    confirmEligiblePaged.length > 0 && confirmSelectedOnPage === confirmEligiblePaged.length;

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
        confirmEligiblePaged.forEach((order) => next.delete(order.id));
      } else {
        confirmEligiblePaged.forEach((order) => next.add(order.id));
      }
      return next;
    });
  };

  // Chuyển 1 đơn sang bước tiếp theo qua API.
  const postTransition = async (
    id: string,
    to: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    let response: Response;
    try {
      response = await fetch(`/api/orders/${encodeURIComponent(id)}/transitions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
    } catch {
      return { ok: false, message: "Không gọi được API." };
    }
    if (!response.ok) {
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        // Rơi xuống thông báo mặc định ở dưới.
      }
      return { ok: false, message: parseApiMessage(data, `API trả về ${response.status}.`) };
    }
    return { ok: true };
  };

  // Xác nhận hàng loạt: chuyển từng đơn đã chọn sang bước tiếp theo của
  // nó (Mới tạo -> Đã kiểm tra, Đã kiểm tra -> Chờ kho). Dừng ở lỗi đầu
  // tiên, báo số đơn đã xong và số đơn bỏ qua vì chưa đủ điều kiện.
  const confirmSelectedOrders = async () => {
    if (confirmBusy) return;
    const targets = confirmOrders.filter((order) => confirmSelected.has(order.id));
    if (targets.length === 0) return;
    setConfirmBusy(true);
    setConfirmNote(null);
    setConfirmError(null);
    let done = 0;
    const skipped: string[] = [];
    let stoppedAt: string | null = null;
    for (const order of targets) {
      const next = forwardTransitionFor(order);
      if (!next) {
        skipped.push(order.id);
        continue;
      }
      const result = await postTransition(order.id, next.to);
      if (!result.ok) {
        stoppedAt = `Đơn ${order.id}: ${result.message}`;
        break;
      }
      done += 1;
    }
    setConfirmBusy(false);
    if (stoppedAt !== null) {
      setConfirmError(stoppedAt);
    }
    const parts: string[] = [];
    if (done > 0) parts.push(`Đã xác nhận ${done} đơn, chuyển sang bước tiếp theo.`);
    if (skipped.length > 0) parts.push(`Bỏ qua ${skipped.length} đơn chưa đủ điều kiện: ${skipped.join(", ")}.`);
    if (parts.length > 0) setConfirmNote(parts.join(" "));
    setConfirmSelected(new Set());
    router.refresh();
  };

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
      const current = prev[id] ?? (order ? prefilledSplit(order) : { province: "", ward: "", street: "" });
      const next = { ...current, ...patch };
      if (patch.province !== undefined) {
        next.ward = "";
      }
      return { ...prev, [id]: next };
    });
  };

  // Gửi toàn bộ địa chỉ đã tách lên API; API thay địa chỉ cũ và tính
  // lại tin cậy ngay. Trả về tin cậy mới khi thành công. Địa chỉ gửi
  // lên chỉ còn tỉnh/phường/đường theo danh mục mới; quận/huyện cũ
  // (nếu đơn còn lưu) bị thay bằng địa chỉ mới này.
  const patchAddress = async (id: string, split: RowSplit, raw?: string): Promise<{ ok: true; trust: number | null } | { ok: false; message: string }> => {
    const street = split.street.trim();
    let response: Response;
    try {
      response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: {
            ...(raw !== undefined && raw.trim() !== "" ? { raw: raw.trim() } : {}),
            province: split.province,
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
      return { ok: false, message: parseApiMessage(data, `API trả về ${response.status}.`) };
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
    const result = await patchAddress(order.id, split, order.address?.raw);
    setPendingBusy(false);
    if (!result.ok) {
      setPendingError(`Đơn ${order.id}: ${result.message}`);
      return;
    }
    setPendingNote(`Đã tách ${order.id}, tin cậy mới ${result.trust === null ? "-" : `${result.trust}%`}.`);
    router.refresh();
  };

  // Tách tuần tự từng đơn đã chọn mà đã đủ tỉnh và phường; dừng ở lỗi
  // đầu tiên. Đơn chưa đủ thì bỏ qua kèm ghi chú.
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
      const result = await patchAddress(order.id, split, order.address?.raw);
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
    if (skipped.length > 0) parts.push(`Bỏ qua ${skipped.length} đơn chưa đủ tỉnh/thành phố và xã/phường: ${skipped.join(", ")}.`);
    if (parts.length > 0) setPendingNote(parts.join(" "));
    setPendingSelected(new Set());
    router.refresh();
  };

  // Ghi/xóa lỗi phân tách đã lưu trên đơn (để đơn sang tab Lỗi hoặc về
  // tab Chờ): chỉ thêm/xóa splitError, giữ nguyên địa chỉ + điểm tin cậy.
  const patchSplitError = async (
    id: string,
    splitError: { code: string; message: string } | null,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    let response: Response;
    try {
      response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: { splitError } }),
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
      return { ok: false, message: parseApiMessage(data, `API trả về ${response.status}.`) };
    }
    return { ok: true };
  };

  // Gọi AI phân tách cho 1 đơn: dùng chuỗi thô đã lưu trên đơn (server
  // tách chuỗi đó), không còn ô dán chuỗi ở từng dòng.
  const callSuggest = async (
    orderId: string,
  ): Promise<{ ok: true; data: SuggestResponse } | { ok: false; message: string }> => {
    let response: Response;
    try {
      response = await fetch("/api/address/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
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
      return { ok: false, message: parseApiMessage(data, `API trả về ${response.status}.`) };
    }
    return { ok: true, data: data as SuggestResponse };
  };

  const suggestOne = async (order: ApiOrderDetail, openModalOnMedium = true) => {
    if ((aiBusy[order.id] ?? false) || aiAllBusy) return;
    setAiBusy((prev) => ({ ...prev, [order.id]: true }));
    setSuggestErrors((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    const result = await callSuggest(order.id);
    setAiBusy((prev) => ({ ...prev, [order.id]: false }));
    if (!result.ok) {
      setSuggestErrors((prev) => ({ ...prev, [order.id]: result.message }));
      return;
    }
    const data = result.data;
    setSuggestions((prev) => ({ ...prev, [order.id]: data }));
    if (data.applied) {
      setPendingNote(
        `Đã tự áp dụng địa chỉ ${order.id}, tin cậy ${data.before.trust}% -> ${data.after.trust}%. Xem audit.`,
      );
      router.refresh();
      return;
    }
    if (data.proposal && openModalOnMedium) {
      openAiModal(order, data);
      return;
    }
    if (data.splitError) {
      // Tách lỗi: lưu lỗi lên đơn để đơn sang tab Lỗi phân tách.
      const saved = await patchSplitError(order.id, data.splitError);
      if (!saved.ok) {
        setPendingError(`Đơn ${order.id}: ${saved.message}`);
        return;
      }
      setPendingNote(`Đơn ${order.id} lỗi phân tách, đã chuyển sang tab Lỗi phân tách để sửa tay.`);
      router.refresh();
      return;
    }
    if (data.after.trust < 70) {
      // Tin cậy thấp (không có đề xuất áp dụng được): lưu phần tách được
      // kèm chuỗi thô để đơn sang tab Lỗi phân tách, sửa tay ở đó.
      const after = data.after.address;
      const saved = await patchAddress(
        order.id,
        {
          province: after.province ?? "",
          ward: after.ward ?? "",
          street: after.street ?? "",
        },
        order.address?.raw,
      );
      if (!saved.ok) {
        setPendingError(`Đơn ${order.id}: ${saved.message}`);
        return;
      }
      setPendingNote(`Đơn ${order.id} tin cậy thấp (${data.after.trust}%), đã chuyển sang tab Lỗi phân tách để sửa tay.`);
      router.refresh();
      return;
    }
  };

  // AI phân tách tuần tự cho tối đa 20 đơn đang lọc: mức cao tự áp dụng,
  // mức giữa giữ đề xuất chờ duyệt ở từng dòng, mức thấp và lỗi phân tách
  // thì lưu lên đơn để đơn sang tab Lỗi phân tách.
  const suggestAll = async () => {
    if (aiAllBusy || pendingBusy) return;
    const targets = filteredPending.slice(0, AI_SUGGEST_ALL_LIMIT);
    if (targets.length === 0) return;
    setAiAllBusy(true);
    setPendingNote(null);
    setPendingError(null);
    let applied = 0;
    let waiting = 0;
    let low = 0;
    let splitErrors = 0;
    let failed = 0;
    for (const order of targets) {
      const result = await callSuggest(order.id);
      if (!result.ok) {
        failed += 1;
        setSuggestErrors((prev) => ({ ...prev, [order.id]: result.message }));
        continue;
      }
      const data = result.data;
      setSuggestions((prev) => ({ ...prev, [order.id]: data }));
      if (data.applied) applied += 1;
      else if (data.proposal) waiting += 1;
      else if (data.splitError) {
        splitErrors += 1;
        await patchSplitError(order.id, data.splitError);
      } else {
        low += 1;
        const after = data.after.address;
        await patchAddress(
          order.id,
          {
            province: after.province ?? "",
            ward: after.ward ?? "",
            street: after.street ?? "",
          },
          order.address?.raw,
        );
      }
    }
    setAiAllBusy(false);
    const parts: string[] = [`Đã phân tách ${targets.length} đơn.`];
    if (applied > 0) parts.push(`${applied} đơn đã tự áp dụng.`);
    if (waiting > 0) parts.push(`${waiting} đơn chờ duyệt, bấm Duyệt ở từng dòng để xem.`);
    if (low > 0) parts.push(`${low} đơn mức thấp, xem tab Lỗi phân tách để sửa tay.`);
    if (splitErrors > 0) parts.push(`${splitErrors} đơn lỗi phân tách, xem tab Lỗi phân tách để sửa tay.`);
    if (failed > 0) parts.push(`${failed} đơn lỗi.`);
    setPendingNote(parts.join(" "));
    router.refresh();
  };

  const openAiModal = (order: ApiOrderDetail, response: SuggestResponse) => {
    if (!response.proposal) return;
    setAiModal({ order, response });
    setAiEditProvince(response.proposal.after.address.province ?? "");
    setAiEditWard(response.proposal.after.address.ward ?? "");
    setAiEditStreet(response.proposal.after.address.street ?? "");
    setAiReason("");
    setAiModalError(null);
  };

  const closeAiModal = () => {
    if (aiModalBusy) return;
    setAiModal(null);
  };

  // Duyệt đề xuất: áp dụng thì gửi kèm địa chỉ đã hiệu chỉnh trong
  // modal (để trống đường thì thôi, API chấm lại); từ chối bắt buộc có
  // lý do. Đề xuất đã quyết định rồi thì API trả 409.
  const decideAi = async (approve: boolean) => {
    if (aiModal === null || aiModalBusy) return;
    const { order, response } = aiModal;
    const proposal = response.proposal;
    if (!proposal) return;
    if (approve && (aiEditProvince === "" || aiEditWard === "")) return;
    if (!approve && aiReason.trim() === "") {
      setAiModalError("Từ chối đề xuất cần ghi rõ lý do.");
      return;
    }
    setAiModalBusy(true);
    setAiModalError(null);
    let res: Response;
    try {
      res = await fetch(`/api/address/proposals/${encodeURIComponent(proposal.id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          approve
            ? {
                decision: "approved",
                ...(aiReason.trim() === "" ? {} : { reason: aiReason.trim() }),
                address: {
                  province: aiEditProvince,
                  ward: aiEditWard,
                  ...(aiEditStreet.trim() === "" ? {} : { street: aiEditStreet.trim() }),
                },
              }
            : { decision: "rejected", reason: aiReason.trim() },
        ),
      });
    } catch {
      setAiModalBusy(false);
      setAiModalError("Không gọi được API.");
      return;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // Rơi xuống thông báo mặc định ở dưới.
    }
    setAiModalBusy(false);
    if (!res.ok) {
      setAiModalError(parseApiMessage(data, `API trả về ${res.status}.`));
      return;
    }
    const decided = data as AddressProposal;
    setAiModal(null);
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    setPendingNote(
      approve
        ? `Đã áp dụng đề xuất ${decided.id} cho ${order.id}, tin cậy mới ${decided.after.trust}%.`
        : `Đã từ chối đề xuất ${decided.id} cho ${order.id}.`,
    );
    router.refresh();
  };

  const draftFor = (order: ApiOrderDetail): RowSplit => confirmDrafts[order.id] ?? prefilledSplit(order);

  const setConfirmDraft = (id: string, patch: Partial<RowSplit>) => {
    setConfirmDrafts((prev) => {
      const order = confirmOrders.find((item) => item.id === id);
      const current = prev[id] ?? (order ? prefilledSplit(order) : { province: "", ward: "", street: "" });
      const next = { ...current, ...patch };
      if (patch.province !== undefined) {
        next.ward = "";
      }
      return { ...prev, [id]: next };
    });
  };

  const openDialog = (order: ApiOrderDetail) => {
    const draft = draftFor(order);
    setDialogOrder(order);
    setEditProvince(draft.province);
    setEditWard(draft.ward);
    setEditDetail(draft.street);
    setDialogError(null);
  };

  const confirmDialog = async () => {
    if (dialogOrder === null || dialogBusy) return;
    const split: RowSplit = { province: editProvince, ward: editWard, street: editDetail };
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

  const dialogComplete = editProvince !== "" && editWard !== "" && editDetail.trim() !== "";

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
              setPendingWard("");
              setPendingPage(1);
            }}
            ariaLabel="Lọc theo tỉnh/thành phố"
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES_2025]}
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
            options={[...ADDRESS_PROVINCES_2025]}
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
          <SearchableSelect
            small
            disabled={pendingProvince === ""}
            value={pendingWard}
            onChange={(value) => {
              setPendingWard(value);
              setPendingPage(1);
            }}
            ariaLabel="Lọc theo xã/phường"
            placeholder="Tìm Xã/Phường"
            options={wardsForProvince(pendingProvince)}
          />
        </span>
      ),
      render: (order) => {
        const split = splitFor(order);
        return (
          <SearchableSelect
            small
            disabled={split.province === ""}
            value={split.ward}
            onChange={(value) => setPendingSplit(order.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${order.id}`}
            placeholder="Tìm Xã/Phường"
            options={wardsForProvince(split.province)}
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
        const busy = aiBusy[order.id] ?? false;
        const suggestion = suggestions[order.id];
        const error = suggestErrors[order.id];
        return (
          <div className="flex w-[190px] flex-col gap-1.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={!complete || pendingBusy}
                onClick={() => splitOne(order)}
                title={complete ? "Tách địa chỉ đơn này" : "Chọn đủ tỉnh/thành phố và xã/phường trước"}
                className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Tách
              </button>
              <button
                type="button"
                disabled={busy || aiAllBusy || pendingBusy}
                onClick={() => suggestOne(order)}
                title="AI phân tách chuỗi địa chỉ khách ghi cho đơn này"
                className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Tách bằng AI
              </button>
            </div>
            {busy && <p className="text-xs text-gray-500">Đang phân tách...</p>}
            {error && <p className="text-xs text-red-700">{error}</p>}
            {suggestion && !suggestion.splitError && (
              <AiResult suggestion={suggestion} onReview={() => openAiModal(order, suggestion)} />
            )}
          </div>
        );
      },
      cellClassName: "!whitespace-normal",
      headerClassName: "w-[190px]",
    },
  ];

  const confirmColumns: TableColumn<ApiOrderDetail>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn đủ điều kiện trên trang này"
          checked={confirmAllPageSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = confirmSelectedOnPage > 0 && !confirmAllPageSelected;
            }
          }}
          onChange={toggleConfirmAllPage}
          disabled={confirmEligiblePaged.length === 0}
          className="size-4 cursor-pointer accent-red-700 disabled:cursor-not-allowed"
        />
      ),
      render: (order) => {
        const eligible = forwardTransitionFor(order) !== undefined;
        if (!eligible) {
          return (
            <input
              type="checkbox"
              aria-label={`Đơn ${order.id} chưa đủ điều kiện xác nhận`}
              checked={false}
              disabled
              className="size-4 accent-red-700"
            />
          );
        }
        return (
          <input
            type="checkbox"
            aria-label={`Chọn đơn ${order.id} để xác nhận`}
            checked={confirmSelected.has(order.id)}
            onChange={() => toggleConfirmOne(order.id)}
            className="size-4 cursor-pointer accent-red-700"
          />
        );
      },
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
              setConfirmWard("");
              setConfirmPage(1);
            }}
            ariaLabel="Lọc theo tỉnh/thành phố"
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES_2025]}
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
            options={[...ADDRESS_PROVINCES_2025]}
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
          <SearchableSelect
            small
            disabled={confirmProvince === ""}
            value={confirmWard}
            onChange={(value) => {
              setConfirmWard(value);
              setConfirmPage(1);
            }}
            ariaLabel="Lọc theo xã/phường"
            placeholder="Tìm Xã/Phường"
            options={wardsForProvince(confirmProvince)}
          />
        </span>
      ),
      render: (order) => {
        const draft = draftFor(order);
        return (
          <SearchableSelect
            small
            disabled={draft.province === ""}
            value={draft.ward}
            onChange={(value) => setConfirmDraft(order.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${order.id}`}
            placeholder="Tìm Xã/Phường"
            options={wardsForProvince(draft.province)}
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

  // Cot cua tab Loi phan tach: giong bang Cho tach (don/khach, sdt, dia chi
  // hien tai, tinh/phuong/duong de sua tay) nhung thay cot Trang thai bang
  // cot Loi phan tach (hop loi do kem ly do) va nut An de dua don ve lai
  // tab Cho tach.
  const errorColumns: TableColumn<ApiOrderDetail>[] = [
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
      header: "Tỉnh/TP",
      render: (order) => {
        const split = splitFor(order);
        return (
          <MiniSelect
            value={split.province}
            onChange={(value) => setPendingSplit(order.id, { province: value })}
            ariaLabel={`Chọn tỉnh/thành phố cho ${order.id}`}
            placeholder="Chọn Tỉnh/TP"
            options={[...ADDRESS_PROVINCES_2025]}
          />
        );
      },
      headerClassName: "w-[139px]",
    },
    {
      key: "ward",
      header: "Xã/Phường",
      render: (order) => {
        const split = splitFor(order);
        return (
          <SearchableSelect
            small
            disabled={split.province === ""}
            value={split.ward}
            onChange={(value) => setPendingSplit(order.id, { ward: value })}
            ariaLabel={`Chọn xã/phường cho ${order.id}`}
            placeholder="Tìm Xã/Phường"
            options={wardsForProvince(split.province)}
          />
        );
      },
      headerClassName: "w-[139px]",
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
      key: "error",
      header: "Lỗi phân tách",
      render: (order) => {
        const splitError = order.address?.splitError ?? null;
        const suggestion = suggestions[order.id];
        if (splitError !== null) {
          return (
            <div className="flex w-[230px] flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-gray-700">
              <p className="font-semibold text-red-800">Lỗi phân tách.</p>
              <p>{splitError.message}</p>
              {suggestion?.after.reasons !== undefined && suggestion.after.reasons.length > 0 && (
                <ul className="list-disc pl-4">
                  {suggestion.after.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              )}
              <p>Sửa tay ở dòng này rồi bấm Tách.</p>
            </div>
          );
        }
        return (
          <p className="w-[230px] rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-gray-700">
            <span className="font-semibold text-red-800">Mức thấp, nhập tay.</span>{" "}
            Tin cậy chỉ {order.addressTrust ?? "-"}%, chưa đủ để xác nhận. Sửa tay tỉnh/thành phố, xã/phường và địa chỉ chi tiết rồi bấm Tách.
          </p>
        );
      },
      cellClassName: "!whitespace-normal",
      headerClassName: "w-[230px]",
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
      key: "actions",
      header: "Hành động",
      render: (order) => {
        const splitError = order.address?.splitError ?? null;
        const complete = splitComplete(splitFor(order));
        return (
          <div className="flex w-[150px] flex-col gap-1.5">
            <button
              type="button"
              disabled={!complete || pendingBusy}
              onClick={() => splitOne(order)}
              title={complete ? "Tách địa chỉ đơn này" : "Chọn đủ tỉnh/thành phố và xã/phường trước"}
              className="flex h-8 items-center self-start rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tách
            </button>
            {splitError !== null && (
              <button
                type="button"
                disabled={pendingBusy}
                onClick={async () => {
                  const saved = await patchSplitError(order.id, null);
                  if (!saved.ok) {
                    setPendingError(`Đơn ${order.id}: ${saved.message}`);
                    return;
                  }
                  setPendingNote(`Đã ẩn lỗi phân tách của đơn ${order.id}, đơn về lại tab Chờ tách.`);
                  router.refresh();
                }}
                className="flex h-8 items-center self-start rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Ẩn
              </button>
            )}
          </div>
        );
      },
      cellClassName: "!whitespace-normal",
      headerClassName: "w-[150px]",
    },
  ];

  const aiEditComplete = aiEditProvince !== "" && aiEditWard !== "";

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
            {item.key === "error" && splitErrorOrders.length > 0 ? ` (${splitErrorOrders.length})` : ""}
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
            <button
              type="button"
              onClick={suggestAll}
              disabled={filteredPending.length === 0 || aiAllBusy || pendingBusy}
              title="AI phân tách cho tối đa 20 đơn đang lọc"
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              AI phân tách
            </button>
            <p className="text-[13px] text-gray-500">
              Tách địa chỉ cho các đơn đã chọn, tin cậy mới do API tính lại. AI phân tách tối đa 20 đơn đang lọc mỗi lần; mức cao tự áp dụng, mức giữa chờ duyệt, lỗi và mức thấp sang tab Lỗi phân tách.
            </p>
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
                      setConfirmWard("");
                      setConfirmPage(1);
                    }}
                    ariaLabel="Lọc theo tỉnh/thành phố"
                    placeholder="Tất cả tỉnh/thành phố"
                    options={[...ADDRESS_PROVINCES_2025]}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="confirm-sort" className="text-sm font-medium text-gray-700">
                    Sắp xếp
                  </label>
                  <FilterSelect
                    id="confirm-sort"
                    value={confirmSort}
                    onChange={(value) => {
                      setConfirmSort(value);
                      setConfirmPage(1);
                    }}
                    ariaLabel="Sắp xếp đơn chờ xác nhận"
                    placeholder="Sắp xếp"
                    options={[...CONFIRM_SORT_OPTIONS]}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirmSelectedOrders}
              disabled={confirmSelected.size === 0 || confirmBusy}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận
            </button>
            <p className="text-[13px] text-gray-500">
              Xác nhận các đơn đã chọn để chuyển sang bước tiếp theo (Mới tạo -&gt; Đã kiểm tra, Đã kiểm tra -&gt; Chờ kho). Chỉ đơn ở 2 trạng thái này và đúng vai Điều phối viên mới chọn được.
            </p>
          </div>
          {confirmSelected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-gray-600">{confirmSelected.size} dòng đã được chọn</p>
              <button
                type="button"
                onClick={confirmSelectedOrders}
                disabled={confirmBusy}
                className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xác nhận
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
          {confirmNote !== null && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{confirmNote}</p>
          )}
          {confirmError !== null && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{confirmError}</p>
          )}

          <section aria-label="Hàng đợi xác nhận địa chỉ" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <Table bare columns={confirmColumns} rows={confirmPaged} rowKey={(order) => order.id} emptyText="Không có đơn đã tách xong" />
            <div className="border-t border-gray-200">
              <Pagination page={confirmSafePage} totalPages={confirmTotalPages} onPageChange={setConfirmPage} range={confirmRange} />
            </div>
          </section>
        </>
      )}

      {tab === "error" && (
        <section aria-label="Lỗi phân tách địa chỉ" className="overflow-hidden rounded-lg border border-red-200 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <h2 className="text-sm font-bold text-red-800">Lỗi phân tách ({splitErrorOrders.length})</h2>
            <p className="text-xs text-red-700">
              Địa chỉ không xác định được an toàn từ dữ liệu hành chính nên hệ thống không đoán. Sửa tay tỉnh/thành phố, xã/phường và địa chỉ chi tiết rồi bấm Tách.
            </p>
          </div>
          <Table
            bare
            columns={errorColumns}
            rows={errorPaged}
            rowKey={(order) => order.id}
            emptyText="Không có đơn lỗi phân tách. Đơn nào AI phân tách mà không xác định được địa chỉ sẽ hiện ở đây để sửa tay."
          />
          <div className="border-t border-gray-200">
            <Pagination page={errorSafePage} totalPages={errorTotalPages} onPageChange={setErrorPage} range={errorRange} />
          </div>
        </section>
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
              {dialogOrder.addressTrust !== null && (
                <p className="text-sm text-gray-700">
                  Tin cậy hiện tại:{" "}
                  <span className={`font-semibold ${trustTextClass(dialogOrder.addressTrust)}`}>{trustLabel(dialogOrder)}</span>
                </p>
              )}
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
                    setEditWard("");
                  }}
                  ariaLabel="Hiệu chỉnh tỉnh/thành phố"
                  placeholder="Chọn Tỉnh/TP"
                  options={[...ADDRESS_PROVINCES_2025]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="dialog-ward" className="text-sm font-medium text-gray-600">
                  Xã/Phường
                </label>
                <SearchableSelect
                  small
                  disabled={editProvince === ""}
                  id="dialog-ward"
                  value={editWard}
                  onChange={setEditWard}
                  ariaLabel="Hiệu chỉnh xã/phường"
                  placeholder="Tìm Xã/Phường"
                  options={wardsForProvince(editProvince)}
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

      <Modal
        open={aiModal !== null}
        onClose={closeAiModal}
        title="Duyệt đề xuất chuẩn hóa địa chỉ"
        footer={
          <>
            <button
              type="button"
              onClick={closeAiModal}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={aiReason.trim() === "" || aiModalBusy}
              onClick={() => decideAi(false)}
              title={aiReason.trim() === "" ? "Từ chối cần ghi rõ lý do" : "Từ chối đề xuất này"}
              className="flex h-9 items-center rounded-md border border-red-700 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Từ chối
            </button>
            <button
              type="button"
              disabled={!aiEditComplete || aiModalBusy}
              onClick={() => decideAi(true)}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Áp dụng
            </button>
          </>
        }
      >
        {aiModal !== null && aiModal.response.proposal !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Đơn {aiModal.order.id} - Khách hàng: {aiModal.order.customer} - SĐT: {aiModal.order.phone ?? "-"} - Đề xuất{" "}
              {aiModal.response.proposal.id}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-gray-500">Địa chỉ hiện tại</p>
              <div className="rounded-lg border border-gray-300 bg-gray-100 p-2 text-sm text-gray-800">{joinAddress(aiModal.order)}</div>
              <p className="text-sm text-gray-700">
                Tin cậy hiện tại:{" "}
                <span className={`font-semibold ${trustTextClass(aiModal.response.before.trust)}`}>
                  {aiModal.response.before.trust}% - {aiModal.response.before.level}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-gray-500">Địa chỉ đề xuất</p>
              <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-gray-800">
                {formatSuggested(aiModal.response.proposal.after.address)}
              </div>
              <p className="text-sm text-gray-700">
                Tin cậy sau đề xuất:{" "}
                <span className={`font-semibold ${trustTextClass(aiModal.response.after.trust)}`}>
                  {aiModal.response.after.trust}% - {aiModal.response.after.level}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                {aiModal.response.source === "llm"
                  ? "Gợi ý từ LLM (đã kiểm lại phường với danh mục)."
                  : "Gợi ý từ luật."}
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700">
                {aiModal.response.after.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-900">Hiệu chỉnh trước khi áp dụng</p>
              <div className="flex flex-col gap-1">
                <label htmlFor="ai-province" className="text-sm font-medium text-gray-600">
                  Tỉnh/TP
                </label>
                <FilterSelect
                  id="ai-province"
                  value={aiEditProvince}
                  onChange={(value) => {
                    setAiEditProvince(value);
                    setAiEditWard("");
                  }}
                  ariaLabel="Hiệu chỉnh tỉnh/thành phố"
                  placeholder="Chọn Tỉnh/TP"
                  options={[...ADDRESS_PROVINCES_2025]}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ai-ward" className="text-sm font-medium text-gray-600">
                  Xã/Phường
                </label>
                <SearchableSelect
                  disabled={aiEditProvince === ""}
                  id="ai-ward"
                  value={aiEditWard}
                  onChange={setAiEditWard}
                  ariaLabel="Hiệu chỉnh xã/phường"
                  placeholder="Tìm Xã/Phường"
                  options={wardsForProvince(aiEditProvince)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ai-street" className="text-sm font-medium text-gray-600">
                  Địa chỉ chi tiết
                </label>
                <input
                  id="ai-street"
                  type="text"
                  value={aiEditStreet}
                  onChange={(event) => setAiEditStreet(event.target.value)}
                  placeholder="Số nhà, ngõ, đường..."
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-500"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ai-reason" className="text-sm font-medium text-gray-600">
                Lý do (bắt buộc khi từ chối)
              </label>
              <input
                id="ai-reason"
                type="text"
                value={aiReason}
                onChange={(event) => setAiReason(event.target.value)}
                placeholder="Ví dụ: phường này đã tách, cần xác minh thêm"
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-500"
              />
            </div>
            {aiModalError !== null && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiModalError}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

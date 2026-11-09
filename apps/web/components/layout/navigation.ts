// SPDX-License-Identifier: Apache-2.0
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Ban,
  BarChart3,
  ClipboardList,
  Clock,
  Headset,
  LayoutGrid,
  LocateFixed,
  MapPin,
  Package,
  Phone,
  Settings,
  User,
} from "lucide-react";

export type NavLeaf = {
  badge?: string;
  href: string;
  icon: LucideIcon;
  label: string;
};

export type NavSection = {
  items: NavLeaf[];
  label: string;
};

// Muc tren cung, dung rieng ngoai cac nhom.
export const NAV_TOP: NavLeaf = {
  href: "/",
  icon: LayoutGrid,
  label: "Tổng quan",
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/orders", icon: ClipboardList, label: "Đơn hàng" },
      {
        badge: "8",
        href: "/approval-queue",
        icon: Clock,
        label: "Hàng đợi duyệt",
      },
      { href: "/restricted-list", icon: Ban, label: "Danh sách hạn chế" },
      { href: "/bi-dx-score", icon: BarChart3, label: "BI và DX-Score" },
      { href: "/telesale", icon: Phone, label: "Telesale" },
      { href: "/address-split", icon: MapPin, label: "Phân tách địa chỉ" },
    ],
    label: "Điều hành",
  },
  {
    items: [
      { href: "/distribution", icon: Package, label: "Phân phối đơn" },
      { href: "/warehouse", icon: Archive, label: "Kho và tồn kho" },
      { href: "/customer-care", icon: Headset, label: "Chăm sóc khách hàng" },
    ],
    label: "Vận hành",
  },
  {
    items: [{ href: "/admin", icon: Settings, label: "Quản trị hệ thống" }],
    label: "Hệ thống",
  },
  {
    items: [
      { href: "/driver", icon: User, label: "Tài xế" },
      { href: "/tracking", icon: LocateFixed, label: "Theo dõi đơn hàng" },
    ],
    label: "Di động và mô phỏng",
  },
];

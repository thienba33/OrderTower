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
      { href: "/don-hang", icon: ClipboardList, label: "Đơn hàng" },
      {
        badge: "8",
        href: "/hang-doi-duyet",
        icon: Clock,
        label: "Hàng đợi duyệt",
      },
      { href: "/danh-sach-han-che", icon: Ban, label: "Danh sách hạn chế" },
      { href: "/bi-dx-score", icon: BarChart3, label: "BI và DX-Score" },
      { href: "/telesale", icon: Phone, label: "Telesale" },
      { href: "/phan-tach-dia-chi", icon: MapPin, label: "Phân tách địa chỉ" },
    ],
    label: "Điều hành",
  },
  {
    items: [
      { href: "/phan-phoi-don", icon: Package, label: "Phân phối đơn" },
      { href: "/kho", icon: Archive, label: "Kho và tồn kho" },
      { href: "/cskh", icon: Headset, label: "Chăm sóc khách hàng" },
    ],
    label: "Vận hành",
  },
  {
    items: [{ href: "/quan-tri", icon: Settings, label: "Quản trị hệ thống" }],
    label: "Hệ thống",
  },
  {
    items: [
      { href: "/tai-xe", icon: User, label: "Tài xế" },
      { href: "/theo-doi", icon: LocateFixed, label: "Theo dõi đơn hàng" },
    ],
    label: "Di động và mô phỏng",
  },
];

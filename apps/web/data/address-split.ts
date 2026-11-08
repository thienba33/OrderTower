// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man Phan tach dia chi (2 che do
// xem: Cho tach dia chi, Xac nhan dia chi; dialog Xac nhan dia chi).
// 5 dong cho tach va 5 dong xac nhan dau giu nguyen tung gia tri trong khung
// (32:1766, 32:2192, 32:2659). 7 dong sau moi tab suy ra theo cung mau:
// cho tach noi tiep DH-1066..1072, KH-076..082; xac nhan lay DH-1001..1007
// kem KH va SDT tu danh sach don, chia 3 dong Cho xac nhan, 3 dong Da xac
// nhan, 1 dong Loi phan tach de dung so lieu tab con trong khung (5/6/1).
// Luu y: khung ghi DH-1061..1065 la KH-071..075, trong khi danh sach don ghi
// KH-068/KH-075/KH-082/KH-089/KH-096; man nay lay theo khung, giong cach
// Telesale lay DH-1019 theo khung. 5 dong xac nhan dau khop danh sach don
// (KH va SDT giong het orders.ts).
// Quy tac do tin cay: duoi 70 do "Rui ro cao", 70-94 vang "Can luu y",
// tu 95 xanh "Tin cay cao"; muc quan/huyen bang tong cong 16, tran 97,
// muc tinh va xa bang tong (DH-1044 trong khung: 62/78/62, khop quy tac).
// Tach tay (chon du 3 cap roi bam Tach) cho do tin cay 78; Tach tat ca
// (tach tu dong theo goi y) cho 62; ca hai dua sang hang doi xac nhan voi
// trang thai "Cho xac nhan". "Phuong Tran Hung Dao" (Hoan Kiem) la suy ra,
// khong co trong khung.

export const ADDRESS_PROVINCES = ["Hà Nội", "Hải Phòng", "Quảng Ninh"] as const;
export type AddressProvince = (typeof ADDRESS_PROVINCES)[number];

export const ADDRESS_DISTRICTS: Record<AddressProvince, string[]> = {
  "Hà Nội": ["Hai Bà Trưng", "Hoàn Kiếm", "Đông Anh", "Đống Đa"],
  "Hải Phòng": ["Hồng Bàng"],
  "Quảng Ninh": ["Hạ Long"],
};

export const ADDRESS_WARDS: Record<string, string[]> = {
  "Hai Bà Trưng": ["Phường Phạm Đình Hổ"],
  "Hoàn Kiếm": ["Phường Trần Hưng Đạo"],
  "Đông Anh": ["Xã Đông Anh"],
  "Đống Đa": ["Phường Láng Hạ"],
  "Hồng Bàng": ["Phường Hoàng Văn Thụ"],
  "Hạ Long": ["Phường Bãi Cháy"],
};

export function allDistricts(): string[] {
  return Array.from(new Set(Object.values(ADDRESS_DISTRICTS).flat()));
}

export function allWards(): string[] {
  return Array.from(new Set(Object.values(ADDRESS_WARDS).flat()));
}

export type AddressTrustLevel = "Rủi ro cao" | "Cần lưu ý" | "Tin cậy cao";

export function trustLevel(trust: number): AddressTrustLevel {
  if (trust < 70) return "Rủi ro cao";
  if (trust < 95) return "Cần lưu ý";
  return "Tin cậy cao";
}

export function trustTextClass(trust: number): string {
  if (trust < 70) return "text-red-700";
  if (trust < 95) return "text-yellow-600";
  return "text-green-700";
}

export function trustDotClass(trust: number): string {
  if (trust < 70) return "bg-red-700";
  if (trust < 95) return "bg-yellow-600";
  return "bg-green-700";
}

export function splitConfLevels(trust: number): { province: number; district: number; ward: number } {
  return { province: trust, district: Math.min(97, trust + 16), ward: trust };
}

export type PendingAddressRow = {
  id: string;
  customer: string;
  phone: string;
  rawAddress: string;
  streetDetail: string;
  suggestedProvince: string;
  suggestedDistrict: string;
  suggestedWard: string;
};

export const PENDING_ADDRESS_ROWS: PendingAddressRow[] = [
  { id: "DH-1061", customer: "KH-071", phone: "0913 *** 222", rawAddress: "Số 8 ngõ 12 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", streetDetail: "Số 8 ngõ 12 Trần Hưng Đạo", suggestedProvince: "Hà Nội", suggestedDistrict: "Hoàn Kiếm", suggestedWard: "Phường Trần Hưng Đạo" },
  { id: "DH-1062", customer: "KH-072", phone: "0904 *** 891", rawAddress: "Thôn 3, xã Đông Anh, Hà Nội, gần chợ", streetDetail: "Thôn 3, gần chợ", suggestedProvince: "Hà Nội", suggestedDistrict: "Đông Anh", suggestedWard: "Xã Đông Anh" },
  { id: "DH-1063", customer: "KH-073", phone: "0986 *** 340", rawAddress: "12 Lê Lợi, Hải Phòng, tầng 2", streetDetail: "Số 12 Lê Lợi", suggestedProvince: "Hải Phòng", suggestedDistrict: "Hồng Bàng", suggestedWard: "Phường Hoàng Văn Thụ" },
  { id: "DH-1064", customer: "KH-074", phone: "0935 *** 667", rawAddress: "Khu 5, phường Bãi Cháy, Hạ Long", streetDetail: "Khu 5", suggestedProvince: "Quảng Ninh", suggestedDistrict: "Hạ Long", suggestedWard: "Phường Bãi Cháy" },
  { id: "DH-1065", customer: "KH-075", phone: "0917 *** 503", rawAddress: "Số 45 đường Láng, Đống Đa, Hà Nội", streetDetail: "Số 45 đường Láng", suggestedProvince: "Hà Nội", suggestedDistrict: "Đống Đa", suggestedWard: "Phường Láng Hạ" },
  { id: "DH-1066", customer: "KH-076", phone: "0903 *** 715", rawAddress: "Số 3 ngõ 8 Lò Đúc, Hai Bà Trưng, Hà Nội", streetDetail: "Số 3 ngõ 8 Lò Đúc", suggestedProvince: "Hà Nội", suggestedDistrict: "Hai Bà Trưng", suggestedWard: "Phường Phạm Đình Hổ" },
  { id: "DH-1067", customer: "KH-077", phone: "0918 *** 748", rawAddress: "Thôn 1, xã Đông Anh, Hà Nội", streetDetail: "Thôn 1", suggestedProvince: "Hà Nội", suggestedDistrict: "Đông Anh", suggestedWard: "Xã Đông Anh" },
  { id: "DH-1068", customer: "KH-078", phone: "0987 *** 781", rawAddress: "Số 28 đường Láng, Đống Đa, Hà Nội", streetDetail: "Số 28 đường Láng", suggestedProvince: "Hà Nội", suggestedDistrict: "Đống Đa", suggestedWard: "Phường Láng Hạ" },
  { id: "DH-1069", customer: "KH-079", phone: "0934 *** 814", rawAddress: "Số 9 Lê Lợi, Hải Phòng, tầng 3", streetDetail: "Số 9 Lê Lợi", suggestedProvince: "Hải Phòng", suggestedDistrict: "Hồng Bàng", suggestedWard: "Phường Hoàng Văn Thụ" },
  { id: "DH-1070", customer: "KH-080", phone: "0915 *** 847", rawAddress: "Khu 8, phường Bãi Cháy, Hạ Long", streetDetail: "Khu 8", suggestedProvince: "Quảng Ninh", suggestedDistrict: "Hạ Long", suggestedWard: "Phường Bãi Cháy" },
  { id: "DH-1071", customer: "KH-081", phone: "0906 *** 880", rawAddress: "Số 11 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", streetDetail: "Số 11 Trần Hưng Đạo", suggestedProvince: "Hà Nội", suggestedDistrict: "Hoàn Kiếm", suggestedWard: "Phường Trần Hưng Đạo" },
  { id: "DH-1072", customer: "KH-082", phone: "0912 *** 913", rawAddress: "Thôn 2 Đông Anh gần chợ", streetDetail: "Thôn 2, gần chợ", suggestedProvince: "Hà Nội", suggestedDistrict: "Đông Anh", suggestedWard: "Xã Đông Anh" },
];

export type ConfirmAddressStatus = "Chờ xác nhận" | "Đã xác nhận" | "Lỗi phân tách";

export type ConfirmAddressRow = {
  id: string;
  customer: string;
  phone: string;
  rawAddress: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  trust: number | null;
  status: ConfirmAddressStatus;
};

export const CONFIRM_ADDRESS_ROWS: ConfirmAddressRow[] = [
  { id: "DH-1044", customer: "KH-033", phone: "0987 *** 210", rawAddress: "Số 12 ngõ 45 Lò Đúc, Hai Bà Trưng", province: "Hà Nội", district: "Hai Bà Trưng", ward: "Phường Phạm Đình Hổ", detail: "Số 12, ngõ 45 phố Lò Đúc", trust: 62, status: "Chờ xác nhận" },
  { id: "DH-1038", customer: "KH-041", phone: "0934 *** 902", rawAddress: "Thôn 3 Đông Anh gần chợ", province: "Hà Nội", district: "Đông Anh", ward: "Xã Đông Anh", detail: "Thôn 3, gần chợ", trust: 78, status: "Chờ xác nhận" },
  { id: "DH-1033", customer: "KH-058", phone: "0918 *** 674", rawAddress: "45 đường Láng, Đống Đa", province: "Hà Nội", district: "Đống Đa", ward: "Phường Láng Hạ", detail: "Số 45 đường Láng", trust: 88, status: "Đã xác nhận" },
  { id: "DH-1029", customer: "KH-019", phone: "0906 *** 443", rawAddress: "12 Lê Lợi, Hải Phòng", province: "Hải Phòng", district: "Hồng Bàng", ward: "Phường Hoàng Văn Thụ", detail: "Số 12 Lê Lợi", trust: 94, status: "Đã xác nhận" },
  { id: "DH-1024", customer: "KH-022", phone: "0915 *** 887", rawAddress: "Khu 5 Bãi Cháy, Hạ Long", province: "Quảng Ninh", district: "Hạ Long", ward: "Phường Bãi Cháy", detail: "Khu 5", trust: 97, status: "Đã xác nhận" },
  { id: "DH-1001", customer: "KH-001", phone: "0912 *** 100", rawAddress: "Số 7 ngõ 3 Lò Đúc, Hai Bà Trưng", province: "Hà Nội", district: "Hai Bà Trưng", ward: "Phường Phạm Đình Hổ", detail: "Số 7 ngõ 3 Lò Đúc", trust: 71, status: "Chờ xác nhận" },
  { id: "DH-1002", customer: "KH-008", phone: "0903 *** 137", rawAddress: "Số 21 đường Láng, Đống Đa", province: "Hà Nội", district: "Đống Đa", ward: "Phường Láng Hạ", detail: "Số 21 đường Láng", trust: 83, status: "Chờ xác nhận" },
  { id: "DH-1003", customer: "KH-015", phone: "0987 *** 174", rawAddress: "Thôn 5 Đông Anh gần đình", province: "Hà Nội", district: "Đông Anh", ward: "Xã Đông Anh", detail: "Thôn 5, gần đình", trust: 69, status: "Chờ xác nhận" },
  { id: "DH-1004", customer: "KH-022", phone: "0934 *** 211", rawAddress: "Số 8 Lê Lợi, Hải Phòng", province: "Hải Phòng", district: "Hồng Bàng", ward: "Phường Hoàng Văn Thụ", detail: "Số 8 Lê Lợi", trust: 91, status: "Đã xác nhận" },
  { id: "DH-1005", customer: "KH-029", phone: "0909 *** 248", rawAddress: "Khu 2 Bãi Cháy, Hạ Long", province: "Quảng Ninh", district: "Hạ Long", ward: "Phường Bãi Cháy", detail: "Khu 2", trust: 86, status: "Đã xác nhận" },
  { id: "DH-1006", customer: "KH-036", phone: "0918 *** 285", rawAddress: "Số 15 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", province: "Hà Nội", district: "Hoàn Kiếm", ward: "Phường Trần Hưng Đạo", detail: "Số 15 Trần Hưng Đạo", trust: 93, status: "Đã xác nhận" },
  { id: "DH-1007", customer: "KH-043", phone: "0906 *** 322", rawAddress: "Ngõ cụt gần chợ, Hà Nội", province: "", district: "", ward: "", detail: "", trust: null, status: "Lỗi phân tách" },
];

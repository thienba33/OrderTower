"use client";

// SPDX-License-Identifier: Apache-2.0
import { Search, X } from "lucide-react";

export type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm",
  ariaLabel = "Tìm kiếm",
  className = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-8 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Xóa tìm kiếm"
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-gray-100"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

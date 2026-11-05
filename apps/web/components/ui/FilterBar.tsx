"use client";

// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";

export type FilterBarProps = {
  children: ReactNode;
  onReset?: () => void;
  resetLabel?: string;
};

export function FilterBar({ children, onReset, resetLabel = "Xóa lọc" }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="h-9 rounded-md border px-3 text-sm hover:bg-gray-100"
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}

export type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  className = "",
}: FilterSelectProps) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

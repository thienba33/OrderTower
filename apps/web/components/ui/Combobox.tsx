"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export type ComboboxOption = {
  value: string;
  label: string;
};

export type ComboboxProps = {
  label?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
};

export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = "Chọn một mục",
  emptyText = "Không có mục nào khớp",
  className = "",
  id,
}: ComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open ]);

  const select = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs text-gray-600">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-activedescendant={open && filtered[highlighted] ? `${id}-option-${filtered[highlighted].value}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setQuery("");
            setHighlighted(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlighted((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((prev) => Math.max(prev - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const option = filtered[highlighted];
              if (open && option) {
                select(option);
              } else {
                setOpen(true);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-9 w-full rounded-md border border-gray-300 bg-white pl-3 pr-14 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
        />
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {selected && (
            <button
              type="button"
              aria-label="Xóa lựa chọn"
              onClick={clear}
              className="rounded-md p-1 hover:bg-gray-100"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label={open ? "Đóng danh sách" : "Mở danh sách"}
            onClick={() => {
              setOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 hover:bg-gray-100"
          >
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </span>
      </div>
      {open && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">{emptyText}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${option.value}`}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(option);
                }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                  index === highlighted ? "bg-gray-100" : ""
                }`}
              >
                <span className="flex-1">{option.label}</span>
                {option.value === value && <Check size={16} />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

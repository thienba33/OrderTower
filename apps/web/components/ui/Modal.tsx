"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Đóng dialog"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

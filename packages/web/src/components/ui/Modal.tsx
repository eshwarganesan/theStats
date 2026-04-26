"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
}

const sizeClass = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

/**
 * Accessible modal based on the native `<dialog>` element. It gets
 * focus trapping, Escape-to-close and built-in `aria-modal` semantics
 * for free without pulling in a heavy library.
 */
export function Modal({ open, onClose, title, children, size = "md", footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn(
        "bg-surface-elevated text-ink border border-surface-border",
        "w-[calc(100vw-2rem)] p-0 m-auto",
        "backdrop:bg-black/70 backdrop:backdrop-blur-sm",
        "animate-fade-in",
        sizeClass[size],
      )}
      // Clicking the backdrop (the dialog element itself) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col max-h-[85vh]">
        {title ? (
          <header className="px-5 h-14 flex items-center justify-between border-b border-surface-border shrink-0">
            <h2 className="heading-display text-lg">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
            >
              ✕
            </button>
          </header>
        ) : null}
        <div className="px-5 py-4 overflow-y-auto scrollbar-thin">{children}</div>
        {footer ? (
          <footer className="px-5 py-3 border-t border-surface-border flex justify-end gap-2 shrink-0">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface ConfirmDialogOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Над нижним таббаром пациента или у нижнего края (стафф). */
  placement?: "patientWithTabBar" | "staffPlain";
  feedback?: ReactNode;
}

interface ConfirmDialogViewProps extends ConfirmDialogOptions {
  visible: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const PLACEMENT_BOTTOM: Record<NonNullable<ConfirmDialogOptions["placement"]>, string> = {
  patientWithTabBar:
    "bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+5.25rem))]",
  staffPlain: "bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))]",
};

export function ConfirmDialogView({
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  destructive = false,
  placement = "staffPlain",
  feedback,
  visible,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogViewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        cancelRef.current();
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <button
        type="button"
        className={`fixed inset-0 cursor-default border-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out outline-none ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => { if (!busy) onCancel(); }}
        aria-label="Закрыть"
      />
      <div
        ref={panelRef}
        className={`fixed left-1/2 z-[1] w-[calc(100%-32px)] max-w-md max-h-[calc(100dvh-8rem)] overflow-y-auto origin-bottom -translate-x-1/2 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out dark:border-slate-600 dark:bg-[#1E293B] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${PLACEMENT_BOTTOM[placement]} ${
          visible ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <p
            id="confirm-dialog-title"
            className="text-[16px] font-bold text-[#0F172A] dark:text-white mb-2"
          >
            {title}
          </p>
        ) : (
          <p id="confirm-dialog-title" className="sr-only">
            Подтверждение
          </p>
        )}
        <p id="confirm-dialog-desc" className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed mb-5">
          {message}
        </p>
        {feedback}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="interactive-press-sm flex-1 h-11 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-700 dark:text-slate-200 shadow-raised-surface"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`interactive-press-sm flex-1 h-11 rounded-[10px] text-[14px] font-semibold text-white border shadow-[0_4px_12px_rgba(36,139,207,0.35)] dark:shadow-none disabled:opacity-60 ${
              destructive
                ? "bg-error border-white/15 shadow-[0_4px_12px_rgba(186,26,26,0.35)]"
                : "bg-[#1d6eb8] border-transparent"
            }`}
          >
            {busy ? "Подождите…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { sendErrorReport } from "@/lib/errorReports";

export type ToastPlacementVariant = "patientWithTabBar" | "staffPlain";
export type ToastTone = "success" | "error" | "info";

interface ToastProps {
  message: string;
  visible: boolean;
  variant?: ToastPlacementVariant;
  tone?: ToastTone;
  className?: string;
  onClose?: () => void;
  inline?: boolean;
}

export function Toast({ message, visible, variant = "patientWithTabBar", tone = "success", className = "", onClose, inline = false }: ToastProps) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  useEffect(() => { setReportState("idle"); }, [message, visible]);
  if (!visible) return null;

  const Icon = tone === "error" ? AlertCircle : tone === "info" ? Info : CheckCircle2;
  const displayMessage = message.replace(/Failed to fetch/gi, "Проверьте подключение к интернету и попробуйте снова");
  const sendReport = async () => {
    setReportState("sending");
    try {
      await sendErrorReport(message);
      setReportState("sent");
    } catch {
      setReportState("failed");
    }
  };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${inline ? "relative mb-4" : `fixed left-4 right-4 mx-auto z-[10000] ${variant === "patientWithTabBar" ? "bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]"}`} w-auto max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-[0_8px_32px_rgba(15,23,42,0.22)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "error" ? "text-red-700 dark:text-red-300" : tone === "info" ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300"}`} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug">{displayMessage}</p>
          {tone === "error" && (
            <div className="mt-2 text-sm">
              <p className="mb-1 text-xs font-normal text-slate-700 dark:text-slate-200">В отчёт войдут категории последних событий и текущий экран.</p>
              {reportState === "sent" ? <p className="text-emerald-700 dark:text-emerald-300">Отчёт отправлен администратору</p> : (
                <button type="button" disabled={reportState === "sending"} onClick={() => void sendReport()} className="min-h-11 font-semibold text-blue-800 underline underline-offset-2 disabled:opacity-60 dark:text-blue-300">
                  {reportState === "sending" ? "Отправляем…" : reportState === "failed" ? "Не удалось отправить. Повторить" : "Отправить последние события администратору"}
                </button>
              )}
            </div>
          )}
        </div>
        {onClose && <button type="button" aria-label="Закрыть уведомление" onClick={onClose} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-300"><X className="h-5 w-5" /></button>}
      </div>
    </div>
  );
}

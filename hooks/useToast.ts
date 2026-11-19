"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastTone } from "@/components/ui/Toast";
import { rememberDiagnostic } from "@/lib/errorReports";

type Notice = { message: string; tone: ToastTone };

export function useToast() {
  const [queue, setQueue] = useState<Notice[]>([]);
  const current = queue[0];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissToast = useCallback(() => setQueue((items) => items.slice(1)), []);

  useEffect(() => {
    if (!current || current.tone === "error") return;
    timer.current = setTimeout(dismissToast, 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [current, dismissToast]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    if (tone === "error") rememberDiagnostic("ERROR", message);
    setQueue((items) => [...items, { message, tone }]);
  }, []);

  return {
    toastMessage: current?.message ?? "",
    toastVisible: Boolean(current),
    toastTone: current?.tone ?? "success",
    showToast,
    dismissToast,
  };
}

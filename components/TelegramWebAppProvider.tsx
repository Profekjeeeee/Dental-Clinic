"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { initTelegramWebAppLifecycle } from "@/lib/telegramWebApp";

const TELEGRAM_WEB_APP_SDK = "https://telegram.org/js/telegram-web-app.js";

/** Инициализация Telegram Mini App без блокировки рендера страницы. */
export function TelegramWebAppProvider({ children }: { children: React.ReactNode }) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current = initTelegramWebAppLifecycle();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return (
    <>
      <Script
        src={TELEGRAM_WEB_APP_SDK}
        strategy="afterInteractive"
        onLoad={() => {
          cleanupRef.current?.();
          cleanupRef.current = initTelegramWebAppLifecycle();
        }}
      />
      {children}
    </>
  );
}

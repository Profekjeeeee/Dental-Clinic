"use client";

import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    let timer: number | undefined;
    const handler = (e: Event) => {
      const { dark } = (e as CustomEvent<{ dark: boolean }>).detail;
      document.documentElement.classList.add("theme-transitioning");
      if (timer !== undefined) window.clearTimeout(timer);
      if (dark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem(THEME_STORAGE_KEY, "light");
      }
      timer = window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning");
      }, 280);
    };

    window.addEventListener("themeChange", handler);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("themeChange", handler);
    };
  }, []);

  return <>{children}</>;
}

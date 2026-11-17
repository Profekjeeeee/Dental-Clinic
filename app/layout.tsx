import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "./globals.css";
import "./responsive.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TelegramWebAppProvider } from "@/components/TelegramWebAppProvider";
import PatientAppGate from "@/components/auth/PatientAppGate";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClinicProvider } from "@/contexts/ClinicProvider";
import ClinicBrandingStyles from "@/components/ClinicBrandingStyles";

export const metadata: Metadata = {
  title: "Стоматологическая клиника",
  description: "Личный кабинет пациента",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Дентал",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const themeBootstrapScript =
  "try{var t=localStorage.getItem('theme');" +
  "if(t==='dark')document.documentElement.classList.add('dark');" +
  "else document.documentElement.classList.remove('dark');}catch(e){}";

/** Ранний фон по themeParams до гидрации React (меньше вспышки в WebView). */
const telegramThemeBootstrapScript =
  "try{var w=window.Telegram&&window.Telegram.WebApp;" +
  "if(w){var p=w.themeParams||{};" +
  "var c=p.bg_color||p.secondary_bg_color;" +
  "if(c){document.documentElement.style.backgroundColor=c;" +
  "if(document.body)document.body.style.backgroundColor=c;}}}" +
  "catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Анти-FOUC: применяем сохранённую тему до рендера */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: telegramThemeBootstrapScript }} />
        <TelegramWebAppProvider>
          <ClinicProvider>
            <ClinicBrandingStyles />
            <ThemeProvider>
              <AuthProvider>
                <PatientAppGate>{children}</PatientAppGate>
              </AuthProvider>
            </ThemeProvider>
          </ClinicProvider>
        </TelegramWebAppProvider>
      </body>
    </html>
  );
}

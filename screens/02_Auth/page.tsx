"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { formatRuPhoneInput, isCompleteRuMobileDigits } from "@/lib/phone";
import { ROUTES } from "@/lib/routes";
import { log } from "@/lib/logger";
import { isSupabaseConfigured, supabaseNetworkErrorHint } from "@/lib/supabase/publicConfig";
import { getTelegramInitData } from "@/lib/telegramWebApp";
import { FormulaToothIcon } from "@/components/icons/FormulaToothIcon";

type LoginMode = "client" | "admin" | "doctor" | null;

export default function AuthPage() {
  const router = useRouter();
  const { status, signInWithTelegram, signInClientByPhone, signInEmployeeByPhone } = useAuth();
  const [loginMode, setLoginMode] = useState<LoginMode>("client");
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");

  const handleTelegramSignIn = async () => {
    if (!isSupabaseConfigured()) {
      setError(supabaseNetworkErrorHint());
      return;
    }
    if (!getTelegramInitData()) {
      setLoginMode("client");
      setError("");
      setInfoNotice("Открыто вне Telegram Mini App — войдите по номеру телефона пациента.");
      return;
    }
    setLoading(true);
    setError("");
    setInfoNotice("");
    try {
      const { error: err, redirectTo, needsRegistration } = await signInWithTelegram();
      if (err) {
        setError(err);
        log("ERROR", "auth_telegram_failed", { role: "guest", userId: "", details: err });
        return;
      }
      if (needsRegistration) {
        router.replace(ROUTES.registration);
        return;
      }
      if (redirectTo) router.push(redirectTo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!loginMode) return;
    if (!isSupabaseConfigured()) {
      setError(supabaseNetworkErrorHint());
      return;
    }
    const digits = phoneInput.replace(/\D/g, "");
    if (!isCompleteRuMobileDigits(digits.startsWith("7") ? digits : `7${digits}`)) {
      const label =
        loginMode === "admin"
          ? "Введите корректный номер администратора"
          : loginMode === "doctor"
            ? "Введите корректный номер врача"
            : "Введите корректный номер пациента";
      setError(label);
      return;
    }
    setLoading(true);
    setError("");
    setInfoNotice("");
    try {
      if (loginMode === "client") {
        const { error: err, redirectTo, needsRegistration } = await signInClientByPhone(phoneInput);
        if (err) {
          setError(err);
          return;
        }
        if (needsRegistration && redirectTo) {
          router.replace(redirectTo);
          return;
        }
        if (redirectTo) router.push(redirectTo);
        return;
      }

      const { error: err, redirectTo } = await signInEmployeeByPhone(phoneInput, loginMode);
      if (err) {
        setError(err);
        return;
      }
      if (redirectTo) router.push(redirectTo);
    } finally {
      setLoading(false);
    }
  };

  const toggleLoginMode = (mode: Exclude<LoginMode, null>) => {
    setLoginMode((prev) => (prev === mode ? null : mode));
    setError("");
    setInfoNotice("");
  };

  if (status === "loading") {
    return (
      <main className="min-h-dvh bg-surface dark:bg-app-canvas flex items-center justify-center px-6">
        <p className="text-[15px] text-secondary">Проверяем сессию…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-surface dark:bg-app-canvas flex flex-col justify-center px-6 pb-8">
      <div className="mb-10">
        <div className="flex justify-center mb-6">
          <FormulaToothIcon
            variant="outline"
            className="w-[4.75rem] h-[4.75rem] text-primary shrink-0"
          />
        </div>
        <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-white leading-tight tracking-tight">
          Вход в кабинет
        </h1>
        <p className="text-[15px] text-secondary mt-2 leading-relaxed">
          {getTelegramInitData()
            ? "Войдите через Telegram — профиль подтянется из Mini App автоматически."
            : "Войдите по номеру телефона пациента или через Telegram Mini App."}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Button type="button" size="full" loading={loading} onClick={() => void handleTelegramSignIn()}>
          Войти через Telegram
        </Button>

        {error && !loginMode ? (
          <p className="text-[13px] text-red-600 dark:text-red-400 text-center" role="alert">
            {error}
          </p>
        ) : null}

        <div className="border-t border-[#E2E8F0] dark:border-[#334155] pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`flex-1 min-w-[120px] text-[12px] font-medium px-2 py-2 rounded-xl transition-colors ${
                loginMode === "client"
                  ? "text-primary bg-primary/10"
                  : "text-secondary hover:text-primary"
              }`}
              onClick={() => toggleLoginMode("client")}
            >
              {loginMode === "client" ? "Скрыть" : "Вход для пациента"}
            </button>
            <button
              type="button"
              className={`flex-1 min-w-[120px] text-[12px] font-medium px-2 py-2 rounded-xl transition-colors ${
                loginMode === "admin"
                  ? "text-primary bg-primary/10"
                  : "text-secondary hover:text-primary"
              }`}
              onClick={() => toggleLoginMode("admin")}
            >
              {loginMode === "admin" ? "Скрыть" : "Администратор"}
            </button>
            <button
              type="button"
              className={`flex-1 min-w-[120px] text-[12px] font-medium px-2 py-2 rounded-xl transition-colors ${
                loginMode === "doctor"
                  ? "text-primary bg-primary/10"
                  : "text-secondary hover:text-primary"
              }`}
              onClick={() => toggleLoginMode("doctor")}
            >
              {loginMode === "doctor" ? "Скрыть" : "Врач"}
            </button>
          </div>

          {loginMode ? (
            <form className="flex flex-col gap-4 mt-4" onSubmit={handlePhoneLogin} noValidate>
              {infoNotice && loginMode === "client" ? (
                <p className="text-[12px] text-primary bg-primary/10 px-3 py-2 rounded-xl">
                  {infoNotice}
                </p>
              ) : null}
              <Input
                label={
                  loginMode === "admin"
                    ? "Телефон администратора"
                    : loginMode === "doctor"
                      ? "Телефон врача"
                      : "Телефон пациента (без Telegram)"
                }
                type="tel"
                placeholder="+7 (___) ___-__-__"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(formatRuPhoneInput(e.target.value));
                  setError("");
                }}
                error={error && loginMode ? error : undefined}
                inputMode="tel"
              />
              <p className="text-[12px] text-secondary -mt-2">
                {loginMode === "admin"
                  ? "Только для сотрудников с ролью admin в dental_employees."
                  : loginMode === "doctor"
                    ? "Только для сотрудников с ролью doctor в dental_employees."
                    : "Временный вход по номеру из dental_clients. Если номера нет в базе, откроется регистрация."}
              </p>
              <Button type="submit" variant="secondary" size="full" loading={loading}>
                {loginMode === "client" ? "Войти как пациент" : "Войти по номеру"}
              </Button>
              {loginMode === "client" ? (
                <button
                  type="button"
                  onClick={() => router.push(ROUTES.registration)}
                  className="text-[13px] font-medium text-primary hover:underline text-center"
                >
                  Регистрация нового пациента
                </button>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}

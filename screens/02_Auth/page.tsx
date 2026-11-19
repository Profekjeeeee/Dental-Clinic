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

type EmployeeRole = "admin" | "doctor";

export default function AuthPage() {
  const router = useRouter();
  const { status, signInWithTelegram, signInEmployeeByPhone } = useAuth();
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [role, setRole] = useState<EmployeeRole>("doctor");
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTelegramSignIn = async () => {
    if (!isSupabaseConfigured()) {
      setError(supabaseNetworkErrorHint());
      return;
    }
    if (!getTelegramInitData()) {
      setError("Откройте приложение через Telegram.");
      return;
    }
    setLoading(true);
    setError("");
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
    if (!isSupabaseConfigured()) {
      setError(supabaseNetworkErrorHint());
      return;
    }
    const digits = phoneInput.replace(/\D/g, "");
    if (!isCompleteRuMobileDigits(digits.startsWith("7") ? digits : `7${digits}`)) {
      setError(role === "admin" ? "Введите корректный номер администратора" : "Введите корректный номер врача");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: err, redirectTo } = await signInEmployeeByPhone(phoneInput, role);
      if (err) {
        setError(err);
        return;
      }
      if (redirectTo) router.push(redirectTo);
    } finally {
      setLoading(false);
    }
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
          Войдите через Telegram, чтобы открыть кабинет или зарегистрироваться.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Button type="button" size="full" loading={loading} onClick={() => void handleTelegramSignIn()}>
          Войти через Telegram
        </Button>

        <div className="border-t border-[#E2E8F0] pt-3 text-center dark:border-[#334155]">
          <button type="button" aria-expanded={employeeOpen} aria-controls="employee-login"
            disabled={loading} className="min-h-11 text-sm font-medium text-primary"
            onClick={() => { setEmployeeOpen(!employeeOpen); setError(""); }}>
            Вход для сотрудников
          </button>

          {employeeOpen && (
            <form id="employee-login" className="mt-3 flex flex-col gap-4 text-left" onSubmit={handlePhoneLogin} noValidate>
              <fieldset disabled={loading} className="flex flex-wrap gap-x-5 gap-y-2">
                <legend className="sr-only">Роль сотрудника</legend>
                {([{ value: "doctor", label: "Врач" }, { value: "admin", label: "Администратор" }] as const).map((option) => (
                  <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="radio" name="employee-role" value={option.value} checked={role === option.value}
                      onChange={() => { setRole(option.value); setError(""); }} />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <Input
                label={role === "admin" ? "Телефон администратора" : "Телефон врача"}
                type="tel"
                autoComplete="tel"
                placeholder="+7 (___) ___-__-__"
                value={phoneInput}
                onChange={(e) => { setPhoneInput(formatRuPhoneInput(e.target.value)); setError(""); }}
                disabled={loading}
              />
              <Button type="submit" variant="secondary" size="full" loading={loading}>
                Войти по номеру
              </Button>
            </form>
          )}
        </div>
        {error && <p className="text-center text-[13px] text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </div>
    </main>
  );
}

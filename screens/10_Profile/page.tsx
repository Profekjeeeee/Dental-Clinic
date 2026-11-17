"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { logout, getDentalSession, getCurrentUserId, updateClientPersonalProfile } from "@/lib/auth";
import Header from "@/components/layout/Header";
import BottomBar from "@/components/layout/BottomBar";
import { Card } from "@/components/ui/Card";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import {
  getProfile,
  saveProfile,
  getNotifications,
  saveNotifications,
  type UserProfile,
  type UserNotifications,
} from "@/lib/userProfile";
import { formatRuPhoneInput, countPhoneDigits, RU_MOBILE_DIGIT_COUNT } from "@/lib/phone";

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

const NAME_RE = /^[а-яёА-ЯЁa-zA-Z][а-яёА-ЯЁa-zA-Z\s-]{1,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: UserProfile): FormErrors {
  const errors: FormErrors = {};
  if (!NAME_RE.test(form.firstName.trim())) errors.firstName = "Только буквы, минимум 2 символа";
  if (!NAME_RE.test(form.lastName.trim())) errors.lastName = "Только буквы, минимум 2 символа";
  if (countPhoneDigits(form.phone) !== RU_MOBILE_DIGIT_COUNT) errors.phone = "Введите номер полностью";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Некорректный email";
  return errors;
}

function getInitials(firstName: string, lastName: string): string {
  return ((firstName.trim()[0] ?? "") + (lastName.trim()[0] ?? "")).toUpperCase() || "?";
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="flex-shrink-0 cursor-pointer relative rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      style={{
        width: 44,
        height: 24,
        backgroundColor: on ? "var(--color-primary)" : "#CBD5E1",
      }}
    >
      <span
        className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{
          transform: on ? "translateX(22px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}

function Field({ label, value, onChange, error, type = "text", inputMode, placeholder }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "h-12 px-4 text-[15px] font-medium outline-none transition-all rounded-[10px] border-[1.5px]",
          "placeholder:text-slate-400 dark:placeholder:text-slate-600",
          error
            ? "border-[#EF4444] bg-[#FFF5F5] shadow-[0_0_0_3px_rgba(239,68,68,0.08)] text-[#0F172A] dark:bg-[#3B1212] dark:border-[#EF4444] dark:text-white"
            : "border-slate-200 bg-[#FAFCFC] text-[#0F172A] dark:bg-[#0F172A] dark:border-slate-700 dark:text-white focus:border-primary dark:focus:border-primary",
        ].join(" ")}
      />
      {error && (
        <p className="text-[12px] font-medium text-[#EF4444]">{error}</p>
      )}
    </div>
  );
}

const NOTIF_ITEMS: { key: keyof UserNotifications; label: string; sub: string }[] = [
  { key: "push", label: "Push-уведомления", sub: "Записи, напоминания и обновления" },
  { key: "sms", label: "СМС-напоминания", sub: "За 24 часа до приёма" },
];

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState<UserProfile>({ firstName: "", lastName: "", phone: "", email: "" });
  const [notifs, setNotifs] = useState<UserNotifications>({ push: true, sms: false });
  const [darkTheme, setDarkTheme] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof UserProfile, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const { toastMessage, toastVisible, toastTone, showToast } = useToast();

  useEffect(() => {
    try {
      setDarkTheme(localStorage.getItem("theme") === "dark");
    } catch {}
    setForm(getProfile());
    setNotifs(getNotifications());
  }, []);

  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const allTouched = Object.keys(touched).length === 4;

  const setField = useCallback(<K extends keyof UserProfile>(key: K, val: UserProfile[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setTouched((t) => ({ ...t, [key]: true }));
  }, []);

  const handlePhoneChange = useCallback((raw: string) => {
    setField("phone", formatRuPhoneInput(raw));
  }, [setField]);

  const handleSave = async () => {
    setTouched({ firstName: true, lastName: true, phone: true, email: true });
    if (hasErrors) return;
    const uid = getCurrentUserId();
    const sess = getDentalSession();
    if (!(sess?.role === "client" && uid && sess.id === uid)) return;

    setSaving(true);
    try {
      await updateClientPersonalProfile({
        clientId: uid,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phoneDigits: form.phone,
      });
      saveProfile(form);
      showToast("Данные успешно обновлены");
    } catch (err) {
      console.error("[Profile] сохранение в Supabase:", err);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Не удалось сохранить. Проверьте связь.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleNotif = (key: keyof UserNotifications) => {
    setNotifs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      saveNotifications(updated);
      return updated;
    });
  };

  const handleThemeToggle = () => {
    const next = !darkTheme;
    setDarkTheme(next);
    window.dispatchEvent(new CustomEvent("themeChange", { detail: { dark: next } }));
  };

  const handleLogout = () => {
    logout();
    router.replace("/auth");
  };

  const initials = getInitials(form.firstName, form.lastName);
  const saveDisabled = saving || (allTouched && hasErrors);

  return (
    <div className="min-h-dvh bg-surface dark:bg-app-canvas pb-safe">
      <Header title="Настройки профиля" showBack backHref="/cabinet" />

      <main className="px-5 py-4 flex flex-col gap-4 pb-28 max-w-[480px] mx-auto">
        {/* Аватар и имя */}
        <div className="flex items-center gap-4 px-1 py-1">
          <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#e3f2fa] to-[#c7e2f9] dark:from-[#163554] dark:to-[#1e3a5f]">
            <span className="text-[20px] font-bold text-primary">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[18px] font-bold text-[#0F172A] dark:text-white truncate">
              {[form.firstName, form.lastName].filter(Boolean).join(" ") || "Ваш профиль"}
            </p>
            <p className="text-[13px] mt-0.5 text-slate-500 dark:text-slate-400">
              Личный профиль пациента
            </p>
          </div>
        </div>

        {/* Личные данные */}
        <Card radius="lg">
          <p className="text-[12px] font-bold uppercase tracking-wider mb-4 text-slate-400 dark:text-slate-500">
            Личные данные
          </p>
          <div className="flex flex-col gap-3.5">
            <Field
              label="Имя"
              value={form.firstName}
              onChange={(v) => setField("firstName", v)}
              error={touched.firstName ? errors.firstName : undefined}
              placeholder="Александр"
            />
            <Field
              label="Фамилия"
              value={form.lastName}
              onChange={(v) => setField("lastName", v)}
              error={touched.lastName ? errors.lastName : undefined}
              placeholder="Коновалов"
            />
            <Field
              label="Телефон"
              value={form.phone}
              onChange={handlePhoneChange}
              error={touched.phone ? errors.phone : undefined}
              type="tel"
              inputMode="tel"
              placeholder="+7 (XXX) XXX-XX-XX"
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => setField("email", v)}
              error={touched.email ? errors.email : undefined}
              type="email"
              inputMode="email"
              placeholder="example@mail.ru"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="mt-5 w-full min-h-[48px] rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:cursor-not-allowed"
            style={{
              backgroundColor: saveDisabled ? "#E2E8F0" : "var(--color-primary)",
              color: saveDisabled ? "#94A3B8" : "#FFFFFF",
            }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              "Сохранить изменения"
            )}
          </button>
        </Card>

        {/* Уведомления */}
        <Card radius="lg">
          <p className="text-[12px] font-bold uppercase tracking-wider mb-2 text-slate-400 dark:text-slate-500">
            Уведомления
          </p>
          <div className="flex flex-col">
            {NOTIF_ITEMS.map((item, idx) => (
              <div
                key={item.key}
                className={`flex items-center justify-between min-h-[56px] py-2.5 ${
                  idx < NOTIF_ITEMS.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""
                }`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-[15px] font-medium text-[#0F172A] dark:text-white">{item.label}</p>
                  <p className="text-[12px] mt-0.5 text-slate-500 dark:text-slate-400">{item.sub}</p>
                </div>
                <Toggle
                  on={notifs[item.key]}
                  onToggle={() => toggleNotif(item.key)}
                  label={item.label}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Оформление */}
        <Card radius="lg">
          <p className="text-[12px] font-bold uppercase tracking-wider mb-2 text-slate-400 dark:text-slate-500">
            Оформление
          </p>
          <div className="flex items-center justify-between min-h-[56px] py-2">
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-[15px] font-medium text-[#0F172A] dark:text-white">Тёмная тема</p>
              <p className="text-[12px] mt-0.5 text-slate-500 dark:text-slate-400">
                Снижает нагрузку на глаза в вечернее время
              </p>
            </div>
            <Toggle
              on={darkTheme}
              onToggle={handleThemeToggle}
              label="Тёмная тема"
            />
          </div>
        </Card>

        {/* Выход */}
        <button
          type="button"
          onClick={handleLogout}
          className="interactive-press-sm flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-red-200/80 dark:border-red-900/40 bg-white dark:bg-slate-900 text-[14px] font-semibold text-[#EF4444]"
        >
          <LogOut className="w-4 h-4" />
          Выйти из аккаунта
        </button>
      </main>

      <BottomBar />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        tone={toastTone}
        variant="patientWithTabBar"
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useLayoutEffect } from "react";
import {
  ArrowRight,
  CalendarPlus,
  CreditCard,
  Lightbulb,
  MapPin,
  MessageCircle,
  ReceiptText,
  Users,
  Video,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import BottomBar from "@/components/layout/BottomBar";
import {
  initAppointments,
  getNextAppointment,
  getUpcomingCount,
  hasAppointmentsCache,
  refreshAppointmentsCache,
  type Appointment,
} from "@/lib/appointments";
import {
  initBills,
  getBills,
  getTotalPending,
  hasBillsCache,
  refreshBillsCache,
} from "@/lib/bills";
import { hasTreatmentPlanCache, type TreatmentPlanStats } from "@/lib/treatmentPlan";
import { initPlanSources, getMergedPlanStats } from "@/lib/planUtils";
import { getProfile } from "@/lib/userProfile";
import { DENTAL_SESSION_CHANGED_EVENT } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { canJoinVideoWindow } from "@/lib/videoConsultation";
import { FormulaToothIcon } from "@/components/icons/FormulaToothIcon";
import { usePatientUnreadCount } from "@/hooks/usePatientUnreadCount";
import { prefetchPatientCabinet } from "@/lib/patientCabinet";

const DAILY_TIPS = [
  "Использование ирригатора снижает риск воспаления дёсен на 40%.",
  "Меняйте зубную щётку каждые 3 месяца, чтобы избежать скопления бактерий.",
  "Чистка языка помогает убрать до 80% бактерий в полости рта.",
  "Флосс — единственный способ эффективно очистить межзубные промежутки.",
  "После кислых фруктов прополощите рот водой, но не чистите зубы 30 минут.",
  "Правильная техника чистки зубов — круговые движения по 2 минуты дважды в день.",
  "Профилактический осмотр каждые 6 месяцев предотвращает 90% серьёзных проблем.",
];

function formatCurrentDate(now: Date): string {
  const weekday = now.toLocaleString("ru-RU", { weekday: "long" });
  const day = now.getDate();
  const month = now.toLocaleString("ru-RU", { month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day} ${month}`;
}

function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

function pluralizeAppointmentsGenitive(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "записи";
  return "записей";
}

export default function MainPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentDateStr, setCurrentDateStr] = useState("");
  const [greeting, setGreeting] = useState("Добрый день");
  const [firstName, setFirstName] = useState("");
  const [nextApt, setNextApt] = useState<Appointment | null>(null);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [planStats, setPlanStats] = useState<TreatmentPlanStats>({
    completed: 0,
    inProgress: 0,
    pending: 0,
    total: 0,
    paidAmount: 0,
    totalAmount: 0,
    progressPercent: 0,
  });
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const chatUnreadCount = usePatientUnreadCount();

  useLayoutEffect(() => {
    const now = new Date();
    setCurrentDateStr(formatCurrentDate(now));
    setGreeting(getGreetingByHour(now.getHours()));
    setFirstName(getProfile().firstName.trim());

    if (hasAppointmentsCache()) {
      setNextApt(getNextAppointment());
      setUpcomingCount(getUpcomingCount());
      setLoading(false);
    }
    if (hasBillsCache()) {
      setPendingAmount(getTotalPending(getBills()));
    }
    if (hasAppointmentsCache() || hasTreatmentPlanCache()) {
      setPlanStats(getMergedPlanStats());
    }
  }, []);

  useEffect(() => {
    const syncHelloName = (): void => {
      const profile = getProfile();
      setFirstName(profile.firstName.trim());
    };
    syncHelloName();

    prefetchPatientCabinet();

    void Promise.all([initAppointments(), initPlanSources(), initBills()])
      .then(() => {
        setNextApt(getNextAppointment());
        setUpcomingCount(getUpcomingCount());
        setPlanStats(getMergedPlanStats());
        setPendingAmount(getTotalPending(getBills()));
      })
      .finally(() => {
        setLoading(false);
      });

    const updateAppointments = () => {
      setNextApt(getNextAppointment());
      setUpcomingCount(getUpcomingCount());
    };

    const updateBills = () => {
      setPendingAmount(getTotalPending(getBills()));
    };

    const updatePlan = () => {
      setPlanStats(getMergedPlanStats());
    };

    const onStorage = () => {
      updateAppointments();
      updateBills();
      updatePlan();
      syncHelloName();
    };

    const syncFresh = () => {
      void Promise.all([refreshAppointmentsCache(true), refreshBillsCache(true)]);
    };
    const onFocus = () => syncFresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncFresh();
    };
    const livePoll = setInterval(() => {
      if (document.visibilityState === "visible") syncFresh();
    }, 15000);

    window.addEventListener("appointmentsUpdated", updateAppointments);
    window.addEventListener("billsUpdated", updateBills);
    window.addEventListener("treatmentPlanUpdated", updatePlan);
    window.addEventListener("profileUpdated", syncHelloName);
    window.addEventListener(DENTAL_SESSION_CHANGED_EVENT, syncHelloName);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const tipInterval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % DAILY_TIPS.length);
        setTipVisible(true);
      }, 350);
    }, 30000);

    return () => {
      window.removeEventListener("appointmentsUpdated", updateAppointments);
      window.removeEventListener("billsUpdated", updateBills);
      window.removeEventListener("treatmentPlanUpdated", updatePlan);
      window.removeEventListener("profileUpdated", syncHelloName);
      window.removeEventListener(DENTAL_SESSION_CHANGED_EVENT, syncHelloName);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(livePoll);
      clearInterval(tipInterval);
    };
  }, []);

  const handleReschedule = () => {
    if (nextApt) {
      router.push(`/booking?appointmentId=${nextApt.id}&isRescheduling=true`);
    }
  };

  const nextAptTitle = nextApt
    ? nextApt.service || nextApt.specialty || "Приём у врача"
    : "";
  const nextAptMeta = nextApt
    ? [nextApt.doctor, nextApt.cabinet ? `Кабинет ${nextApt.cabinet}` : ""]
        .filter(Boolean)
        .join(" · ")
    : "";
  const canJoinNextVideo = Boolean(
    nextApt && nextApt.visitMode === "video" && canJoinVideoWindow(nextApt),
  );

  return (
    <div className="min-h-dvh bg-surface dark:bg-app-canvas pb-safe">
      {/* Шапка приветствия */}
      <header className="px-5 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-2 max-w-[480px] mx-auto">
        {currentDateStr && (
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
            {currentDateStr}
          </p>
        )}
        <h1 className="text-[24px] font-bold text-[#0F172A] dark:text-white mt-0.5 leading-tight">
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
      </header>

      <main className="px-5 py-3 flex flex-col gap-3.5 max-w-[480px] mx-auto">
        {/* Ближайшая запись */}
        {loading ? (
          <div className="h-36 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
        ) : (
          <Card>
            {nextApt ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                      {upcomingCount > 1
                        ? `Ближайшая из ${upcomingCount} ${pluralizeAppointmentsGenitive(upcomingCount)}`
                        : "Ближайшая запись"}
                    </p>
                    <p className="text-[17px] font-semibold text-[#0F172A] dark:text-white leading-snug">
                      {nextAptTitle}
                    </p>
                    {nextAptMeta && (
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {nextAptMeta}
                      </p>
                    )}
                    {nextApt.visitMode === "video" && (
                      <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary mt-1.5">
                        <Video className="w-3.5 h-3.5 shrink-0" />
                        Онлайн-консультация
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[17px] font-bold text-primary tabular-nums">
                      {nextApt.day} {nextApt.month}
                    </p>
                    <p className="text-[14px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {nextApt.time}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {canJoinNextVideo && (
                    <Link
                      href={`/consultation/${nextApt.id}`}
                      className="interactive-press-sm w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[8px] bg-primary text-white text-[13px] font-semibold"
                    >
                      <Video className="w-4 h-4" />
                      Войти в консультацию
                    </Link>
                  )}
                  <div className="flex gap-2">
                    <Link
                      href="/appointments"
                      className={`interactive-press-sm flex-1 min-h-[42px] flex items-center justify-center rounded-[8px] text-[13px] font-semibold ${
                        canJoinNextVideo
                          ? "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0F172A] dark:text-white"
                          : "bg-primary text-white"
                      }`}
                    >
                      Подробнее
                    </Link>
                    <button
                      type="button"
                      className="interactive-press-sm flex-1 min-h-[42px] flex items-center justify-center rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] font-semibold text-primary shadow-raised-surface"
                      onClick={handleReschedule}
                    >
                      Перенести
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-3 text-center">
                <p className="text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Ближайшая запись
                </p>
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Нет предстоящих записей
                </p>
                <Link
                  href="/booking"
                  className="interactive-press-sm mt-3 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-5 rounded-[8px] bg-primary text-white text-[13px] font-semibold"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Записаться
                </Link>
              </div>
            )}
          </Card>
        )}

        {/* Основные действия (без дублирования нижней панели) */}
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/booking" className="interactive-press block">
            <Card padding="sm" className="flex items-center gap-3 min-h-[58px]">
              <div className="w-9 h-9 rounded-[10px] bg-primary-light dark:bg-primary/15 flex items-center justify-center shrink-0">
                <CalendarPlus className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-[#0F172A] dark:text-white leading-tight">
                Записаться
              </span>
            </Card>
          </Link>

          <Link href={ROUTES.patientSupportChat} className="interactive-press block">
            <Card padding="sm" className="flex items-center gap-3 min-h-[58px]">
              <div className="relative w-9 h-9 rounded-[10px] bg-primary-light dark:bg-primary/15 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-primary" />
                {chatUnreadCount > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#248bcf] dark:bg-primary/90 px-1 text-[9px] font-bold leading-none text-white tabular-nums"
                    aria-label={`Непрочитанных сообщений: ${chatUnreadCount}`}
                  >
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
              </div>
              <span className="text-[13px] font-semibold text-[#0F172A] dark:text-white leading-tight">
                Поддержка
              </span>
            </Card>
          </Link>
        </div>

        {/* Клиника: Врачи, Прайс-лист, Контакты */}
        <div className="grid grid-cols-3 gap-2">
          <Link href="/doctors" className="interactive-press block">
            <Card padding="sm" className="text-center py-3">
              <div className="w-8 h-8 rounded-[9px] bg-primary-light dark:bg-primary/15 flex items-center justify-center mx-auto mb-1.5">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[12px] font-semibold text-[#0F172A] dark:text-white leading-tight">
                Врачи
              </p>
            </Card>
          </Link>

          <Link href="/price-list" className="interactive-press block">
            <Card padding="sm" className="text-center py-3">
              <div className="w-8 h-8 rounded-[9px] bg-primary-light dark:bg-primary/15 flex items-center justify-center mx-auto mb-1.5">
                <ReceiptText className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[12px] font-semibold text-[#0F172A] dark:text-white leading-tight">
                Прайс
              </p>
            </Card>
          </Link>

          <Link href="/contacts" className="interactive-press block">
            <Card padding="sm" className="text-center py-3">
              <div className="w-8 h-8 rounded-[9px] bg-primary-light dark:bg-primary/15 flex items-center justify-center mx-auto mb-1.5">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[12px] font-semibold text-[#0F172A] dark:text-white leading-tight">
                Контакты
              </p>
            </Card>
          </Link>
        </div>

        {/* К оплате — показывается только при наличии задолженности */}
        {pendingAmount > 0 && (
          <Card className="border border-primary/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-light dark:bg-primary/15 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">К оплате</p>
                  <p className="text-[20px] font-bold text-[#0F172A] dark:text-white tabular-nums leading-tight">
                    {pendingAmount.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              </div>
              <Link
                href="/bills"
                className="interactive-press-sm min-h-[40px] px-4 flex items-center rounded-[8px] bg-primary text-white text-[13px] font-semibold whitespace-nowrap shrink-0"
              >
                Оплатить
              </Link>
            </div>
          </Card>
        )}

        {/* Компактный индикатор плана лечения (подробности — в «Кабинете» и на странице плана) */}
        {planStats.total > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] font-bold text-[#0F172A] dark:text-white">
                План лечения
              </p>
              <Link
                href="/treatment-plan"
                className="text-[12px] font-semibold text-primary hover:underline whitespace-nowrap"
              >
                Открыть план →
              </Link>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${planStats.progressPercent}%` }}
              />
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
              {planStats.progressPercent}% выполнено · {planStats.completed} из {planStats.total} этапов
            </p>
          </Card>
        )}

        {/* Совет дня */}
        <div className="relative rounded-[16px] overflow-hidden px-5 py-4 bg-gradient-to-br from-[#e8f4fc] via-[#e3f2fa] to-[#cfe8fc] dark:from-slate-800 dark:via-slate-800/95 dark:to-slate-900">
          <FormulaToothIcon
            variant="solid"
            className="absolute -right-2 -top-2 w-28 h-28 text-primary opacity-[0.08] pointer-events-none"
          />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-3 h-3 text-white" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-900 dark:text-sky-100">
              Совет дня
            </p>
          </div>

          <p
            className="text-[14px] font-medium leading-snug pr-8 text-[#0F172A] dark:text-slate-100 transition-opacity duration-300"
            style={{ opacity: tipVisible ? 1 : 0 }}
          >
            {DAILY_TIPS[tipIndex]}
          </p>

          <Link
            href="/prevention"
            className="interactive-press mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary transition-opacity duration-300"
            style={{ opacity: tipVisible ? 1 : 0 }}
          >
            Рекомендации по уходу
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>

      <BottomBar />
    </div>
  );
}

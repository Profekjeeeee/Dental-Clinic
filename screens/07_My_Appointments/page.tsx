"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Video,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import Header from "@/components/layout/Header";
import BottomBar from "@/components/layout/BottomBar";
import {
  initAppointments,
  getAppointments,
  hasAppointmentsCache,
  cancelAppointment,
  refreshAppointmentsCache,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments";
import { canJoinVideoWindow } from "@/lib/videoConsultation";
import { postAppointmentNotifyAsync } from "@/lib/appointmentNotify";
import {
  getBills,
  hasBillsCache,
  initBills,
  refreshBillsCache,
  removeBillByAppointmentId,
  type Bill,
} from "@/lib/bills";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

type AppointmentsTab = "upcoming" | "past";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

function getAppointmentTimestamp(apt: Appointment): number {
  const match = apt.time.trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = match ? parseInt(match[1]!, 10) : 0;
  const mm = match ? parseInt(match[2]!, 10) : 0;
  return new Date(apt.year, apt.monthNum - 1, apt.day, hh, mm, 0, 0).getTime();
}

function isUpcomingStatus(status: AppointmentStatus): boolean {
  return status === "scheduled" || status === "rescheduled" || status === "pending";
}

function getStatusMeta(
  status: AppointmentStatus,
  isExpiredPending: boolean,
  confirmedAt?: string | null,
): {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
} {
  if (isExpiredPending) {
    return {
      label: "Завершена",
      colorClass: "text-slate-500 dark:text-slate-400",
      icon: <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />,
    };
  }
  if (confirmedAt && (status === "pending" || status === "scheduled" || status === "rescheduled")) {
    return {
      label: "Подтверждена",
      colorClass: "text-emerald-600 dark:text-emerald-400",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    };
  }
  switch (status) {
    case "pending":
      return {
        label: "Ожидает",
        colorClass: "text-amber-600 dark:text-amber-400",
        icon: <Clock className="w-4 h-4 text-amber-500 shrink-0" />,
      };
    case "scheduled":
      return {
        label: "Запланирована",
        colorClass: "text-primary",
        icon: <Calendar className="w-4 h-4 text-primary shrink-0" />,
      };
    case "rescheduled":
      return {
        label: "Перенесена",
        colorClass: "text-amber-600 dark:text-amber-400",
        icon: <RefreshCw className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      };
    case "completed":
      return {
        label: "Завершена",
        colorClass: "text-primary",
        icon: <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />,
      };
    case "cancelled":
      return {
        label: "Отменена",
        colorClass: "text-red-500 dark:text-red-400",
        icon: <XCircle className="w-4 h-4 text-red-500 shrink-0" />,
      };
    default:
      return {
        label: String(status),
        colorClass: "text-slate-500 dark:text-slate-400",
        icon: <Clock className="w-4 h-4 text-slate-400 shrink-0" />,
      };
  }
}

export default function AppointmentsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AppointmentsTab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [confirmCancelApt, setConfirmCancelApt] = useState<Appointment | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { toastMessage, toastVisible, toastTone, showToast } = useToast();

  useLayoutEffect(() => {
    if (hasAppointmentsCache()) {
      setAppointments(getAppointments());
      setLoading(false);
    }
    if (hasBillsCache()) {
      setBills(getBills());
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      await initAppointments();
      setAppointments(getAppointments());
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFreshData = useCallback(async () => {
    await Promise.all([refreshAppointmentsCache(), refreshBillsCache()]);
    setAppointments(getAppointments());
    setBills(getBills());
  }, []);

  useEffect(() => {
    void loadData();
    void initBills().then(setBills);

    const onUpdated = () => {
      setAppointments(getAppointments());
      setBills(getBills());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncFreshData();
      }
    };
    const onFocus = () => {
      void syncFreshData();
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncFreshData();
      }
    }, 15000);

    window.addEventListener("appointmentsUpdated", onUpdated);
    window.addEventListener("billsUpdated", onUpdated);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      window.removeEventListener("appointmentsUpdated", onUpdated);
      window.removeEventListener("billsUpdated", onUpdated);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadData, syncFreshData]);

  const handleConfirmCancel = async () => {
    if (!confirmCancelApt) return;
    const target = confirmCancelApt;
    setCancellingId(target.id);
    try {
      await cancelAppointment(target.id);
      postAppointmentNotifyAsync("patient_cancel", target.id);
      const billRemoved = await removeBillByAppointmentId(target.id);
      setAppointments(getAppointments());
      setBills(getBills());
      setConfirmCancelApt(null);
      showToast(billRemoved ? "Запись отменена, счёт отозван" : "Запись отменена");
    } catch (err: unknown) {
      console.error("[appointments] cancel", err);
      const msg = err instanceof Error ? err.message : "Не удалось отменить запись";
      showToast(msg, "error");
    } finally {
      setCancellingId(null);
    }
  };

  const handleReschedule = (apt: Appointment) => {
    router.push(`/booking?appointmentId=${apt.id}&isRescheduling=true`);
  };

  const { upcomingList, pastList } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const upcoming: Appointment[] = [];
    const past: Appointment[] = [];

    for (const apt of appointments) {
      // Отменённые записи скрываются у клиента в Mini App
      if (apt.status === "cancelled") continue;
      const aptDayMs = new Date(apt.year, apt.monthNum - 1, apt.day).getTime();
      if (isUpcomingStatus(apt.status) && aptDayMs >= todayMs) {
        upcoming.push(apt);
      } else {
        past.push(apt);
      }
    }

    upcoming.sort((a, b) => getAppointmentTimestamp(a) - getAppointmentTimestamp(b));
    past.sort((a, b) => getAppointmentTimestamp(b) - getAppointmentTimestamp(a));

    return { upcomingList: upcoming, pastList: past };
  }, [appointments]);

  const activeList = tab === "upcoming" ? upcomingList : pastList;

  const billByAppointmentId = useMemo(() => {
    const map = new Map<string, Bill>();
    for (const b of bills) {
      if (b.appointmentId) {
        map.set(b.appointmentId, b);
      }
    }
    return map;
  }, [bills]);

  return (
    <div className="min-h-dvh bg-surface dark:bg-app-canvas pb-safe">
      <Header
        title="Мои записи"
        rightSlot={
          <Link
            href="/booking"
            className="interactive-press-sm inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] bg-primary text-white text-[12px] font-semibold whitespace-nowrap shrink-0"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Записаться
          </Link>
        }
      />

      {/* Переключатель вкладок */}
      <div className="px-5 pt-4 max-w-[480px] mx-auto">
        <div
          role="tablist"
          aria-label="Фильтр записей"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-[12px] bg-slate-200/70 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upcoming"}
            onClick={() => setTab("upcoming")}
            className={`min-h-[40px] px-3 rounded-[9px] text-[13px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
              tab === "upcoming"
                ? "bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white"
            }`}
          >
            <span>Предстоящие</span>
            <span
              className={`tabular-nums text-[12px] ${
                tab === "upcoming"
                  ? "text-primary font-bold"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {upcomingList.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "past"}
            onClick={() => setTab("past")}
            className={`min-h-[40px] px-3 rounded-[9px] text-[13px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
              tab === "past"
                ? "bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white"
            }`}
          >
            <span>Прошедшие</span>
            <span
              className={`tabular-nums text-[12px] ${
                tab === "past"
                  ? "text-primary font-bold"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {pastList.length}
            </span>
          </button>
        </div>
      </div>

      <main className="px-5 py-4 flex flex-col gap-3 max-w-[480px] mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="h-32 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
            <div className="h-32 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
          </div>
        ) : activeList.length === 0 ? (
          <Card className="py-10 text-center">
            <div className="w-11 h-11 rounded-full bg-primary-light dark:bg-primary/15 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
              {tab === "upcoming"
                ? "Нет предстоящих записей"
                : "Нет прошедших записей"}
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              {tab === "upcoming"
                ? "Выберите удобное время для нового визита"
                : "Завершённые приёмы появятся здесь"}
            </p>
            {tab === "upcoming" && (
              <Link
                href="/booking"
                className="interactive-press-sm mt-4 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-5 rounded-[10px] bg-primary text-white text-[13px] font-semibold"
              >
                <CalendarPlus className="w-4 h-4" />
                Записаться на приём
              </Link>
            )}
          </Card>
        ) : (
          activeList.map((apt) => {
            const isPast = tab === "past";
            const isExpiredPending = isPast && isUpcomingStatus(apt.status);
            const statusMeta = getStatusMeta(apt.status, isExpiredPending, apt.confirmedAt);
            const linkedBill = billByAppointmentId.get(apt.id);
            const realPrice =
              apt.price != null && apt.price > 0
                ? apt.price
                : linkedBill?.totalAmount && linkedBill.totalAmount > 0
                  ? linkedBill.totalAmount
                  : null;
            const isPaid = linkedBill?.status === "paid";
            const isCancelled = apt.status === "cancelled";
            const doctorLine = [
              apt.doctor,
              apt.cabinet ? `Кабинет ${apt.cabinet}` : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Card key={apt.id}>
                {/* Заголовок услуги и статус */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white flex-1 leading-snug">
                    {apt.service}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {statusMeta.icon}
                    <span className={`text-[12px] font-semibold ${statusMeta.colorClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                {/* Врач и кабинет */}
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
                  {doctorLine}
                </p>

                {apt.visitMode === "video" && (
                  <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary mb-2">
                    <Video className="w-3.5 h-3.5 shrink-0" />
                    Онлайн-консультация
                  </p>
                )}

                {/* Дата и стоимость */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-primary tabular-nums">
                    {apt.day} {apt.month} {apt.year}, {apt.time}
                  </p>

                  <div className="flex items-center gap-2 shrink-0">
                    {isPast && isPaid && !isCancelled && (
                      <span className="text-[12px] font-semibold text-primary">
                        Оплачено
                      </span>
                    )}
                    {realPrice != null && (
                      <p
                        className={`text-[14px] font-bold tabular-nums ${
                          isPast || isCancelled
                            ? "text-slate-400 dark:text-slate-500"
                            : "text-[#0F172A] dark:text-white"
                        }`}
                      >
                        {formatPrice(realPrice)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Кнопки управления для предстоящих записей */}
                {!isPast && isUpcomingStatus(apt.status) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    {apt.visitMode === "video" && canJoinVideoWindow(apt) && (
                      <button
                        type="button"
                        onClick={() => router.push(`/consultation/${apt.id}`)}
                        className="interactive-press-sm w-full min-h-[42px] rounded-[8px] bg-primary text-white text-[13px] font-semibold flex items-center justify-center gap-2"
                      >
                        <Video className="w-4 h-4" />
                        Войти в консультацию
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReschedule(apt)}
                        className="interactive-press-sm flex-1 min-h-[40px] rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] font-semibold text-primary shadow-raised-surface"
                      >
                        Перенести
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelApt(apt)}
                        disabled={cancellingId === apt.id}
                        className="interactive-press-sm flex-1 min-h-[40px] rounded-[8px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] font-semibold text-red-500 shadow-raised-surface disabled:opacity-60"
                      >
                        Отменить
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </main>

      {/* Модальное подтверждение отмены записи */}
      {confirmCancelApt && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-apt-title"
        >
          <button
            type="button"
            className="fixed inset-0 bg-black/40 backdrop-blur-sm border-0 cursor-default"
            onClick={() => !cancellingId && setConfirmCancelApt(null)}
            aria-label="Закрыть"
          />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xl mb-16 sm:mb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="cancel-apt-title"
              className="text-[17px] font-bold text-[#0F172A] dark:text-white"
            >
              Отменить запись?
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              {confirmCancelApt.service} · {confirmCancelApt.day} {confirmCancelApt.month},{" "}
              {confirmCancelApt.time}
            </p>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1">
              Неоплаченный счёт по этой записи также будет отозван.
            </p>

            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                disabled={Boolean(cancellingId)}
                onClick={() => setConfirmCancelApt(null)}
                className="interactive-press-sm flex-1 min-h-[44px] rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-600 dark:text-slate-300"
              >
                Оставить
              </button>
              <button
                type="button"
                disabled={Boolean(cancellingId)}
                onClick={() => void handleConfirmCancel()}
                className="interactive-press-sm flex-1 min-h-[44px] rounded-[10px] bg-red-500 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {cancellingId ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Отмена...
                  </>
                ) : (
                  "Да, отменить"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toastMessage}
        visible={toastVisible}
        variant="patientWithTabBar"
        tone={toastTone}
      />
      <BottomBar />
    </div>
  );
}

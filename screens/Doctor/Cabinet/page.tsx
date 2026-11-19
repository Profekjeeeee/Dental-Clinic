"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, LogOut, XCircle } from "lucide-react";
import {
  logout,
  resolveHydratedSession,
  type DentalSession,
  getDentalClients,
  refreshDentalCaches,
  resolveDentalClientFromCacheSync,
  getDentalSession,
} from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import {
  getAllClinicAppointments,
  refreshAppointmentsCache,
  hasAppointmentsCache,
  cancelAppointment,
  rescheduleAppointment,
  RU_MONTHS_SHORT,
  type ClinicAppointment,
} from "@/lib/appointments";
import { postAppointmentNotifyAsync } from "@/lib/appointmentNotify";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useClinicTimeSlots } from "@/hooks/useClinicTimeSlots";
import {
  filterAppointmentsByDoctor,
  isSameCalendarDay,
  sortAppointmentsByTimeAsc,
  appointmentStatusLabelRu,
  formatScheduleHeaderDateStable,
} from "@/lib/doctorSchedule";
import { canJoinVideoWindow } from "@/lib/videoConsultation";
import DoctorMonthCalendar from "@/screens/Doctor/Cabinet/DoctorMonthCalendar";
import dynamic from "next/dynamic";
import ThemeToggleButton from "@/components/ui/ThemeToggleButton";
import { useClientNow } from "@/hooks/useClientNow";
import { DOCTOR_OPEN_PATIENT_MEDICAL_SHEET_EVENT } from "@/lib/doctorMedicalSheetEvents";
import { useClinic } from "@/contexts/ClinicProvider";
import {
  CHAT_UPDATED_EVENT,
  getDoctorDialogPreviews,
  hydrateDentalMessages,
  type StaffDialogPreview,
} from "@/lib/supportChat";

const chatLoading = () => <p role="status" className="p-4 text-sm text-secondary">Загружаем чат…</p>;
const DoctorOrdinatorskayaChat = dynamic(() => import("./DoctorOrdinatorskayaChat"), { loading: chatLoading });
const StaffMessagesPage = dynamic(() => import("@/screens/StaffMessages/page"), { loading: chatLoading });

const PatientMedicalSheet = dynamic(() => import("./PatientMedicalSheet"), {
  ssr: false,
  loading: () => (
    <div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-surface dark:bg-app-canvas">
      Загружаем карту пациента…
    </div>
  ),
});

type DoctorCabinetTab = "calendar" | "chats" | "patients" | "settings";

type DesktopNavId = "schedule" | "chats" | "patients" | "settings";

function formatChatPreviewTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

type DoctorChatsScope = "colleagues" | "patients";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function patientShortName(patientId?: string): string {
  if (!patientId) return "Без привязки к карте";
  const c =
    resolveDentalClientFromCacheSync(patientId) ??
    getDentalClients().find((x) => x.id === patientId);
  if (!c) return patientId;
  const ini = c.firstName.trim().charAt(0);
  return `${c.lastName} ${ini ? `${ini}.` : ""}`.trim();
}

function DoctorCabinetSkeleton() {
  return (
    <main
      className="layout-doctor-cabinet min-h-dvh bg-surface dark:bg-app-canvas pb-page-end"
      aria-busy="true"
    >
      <div className="max-w-[480px] mx-auto px-5 pt-[calc(env(safe-area-inset-top,0px)+3rem)] space-y-4">
        <div className="h-24 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
        <div className="h-[360px] rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
      </div>
    </main>
  );
}

export default function DoctorCabinetPage() {
  const anchor = useClientNow();
  if (!anchor) return <DoctorCabinetSkeleton />;
  return <DoctorCabinetInner anchor={anchor} />;
}

function isAppointmentDoctorEditable(status: ClinicAppointment["status"]): boolean {
  return status === "scheduled" || status === "pending" || status === "rescheduled";
}

function DoctorCabinetInner({ anchor }: { anchor: Date }) {
  const router = useRouter();
  const { settings: clinicSettings } = useClinic();
  const clinicTimeSlots = useClinicTimeSlots();
  const { toastMessage, toastVisible, toastTone, showToast } = useToast();
  const [session, setSession] = useState<DentalSession | null>(null);
  const [dataRev, setDataRev] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(anchor));
  const [selectedDate, setSelectedDate] = useState(() => anchor);
  const [sheetOpen, setSheetOpen] = useState<{
    patientId: string;
    appointment?: ClinicAppointment;
  } | null>(null);
  const [agendaActionId, setAgendaActionId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ClinicAppointment | null>(null);
  const [rescheduleIso, setRescheduleIso] = useState("");
  const [rescheduleTimePick, setRescheduleTimePick] = useState("");
  const [cabinetTab, setCabinetTab] = useState<DoctorCabinetTab>("calendar");
  const [doctorChatsScope, setDoctorChatsScope] = useState<DoctorChatsScope>("colleagues");
  const [chatPreviews, setChatPreviews] = useState<StaffDialogPreview[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotifKeys, setSeenNotifKeys] = useState<string[]>([]);
  const initialSyncDoneRef = useRef(false);
  const toastedNotifKeysRef = useRef<Set<string>>(new Set());

  const seenStorageKey = useMemo(
    () => (session?.id ? `dental_doctor_seen_apt_notifs_${session.id}` : null),
    [session?.id],
  );

  useEffect(() => {
    if (!seenStorageKey) return;
    try {
      const raw = localStorage.getItem(seenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSeenNotifKeys(parsed.filter((x): x is string => typeof x === "string"));
          return;
        }
      }
      setSeenNotifKeys([]);
    } catch {
      setSeenNotifKeys([]);
    }
  }, [seenStorageKey]);

  const persistSeenKeys = useCallback(
    (nextKeys: string[]) => {
      const trimmed = nextKeys.slice(-200);
      setSeenNotifKeys(trimmed);
      if (!seenStorageKey) return;
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(trimmed));
      } catch {
        /* ignore */
      }
    },
    [seenStorageKey],
  );

  const refreshChatPreviews = useCallback(() => {
    const s = getDentalSession();
    if (!s?.phone) {
      setChatPreviews([]);
      return;
    }
    setChatPreviews(getDoctorDialogPreviews(s.phone));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateDentalMessages();
      if (!cancelled) refreshChatPreviews();
    })();
    const onChatUpdate = () => refreshChatPreviews();
    window.addEventListener(CHAT_UPDATED_EVENT, onChatUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(CHAT_UPDATED_EVENT, onChatUpdate);
    };
  }, [refreshChatPreviews]);

  const refreshSchedule = useCallback(async () => {
    setScheduleLoading(!hasAppointmentsCache());
    try {
      await refreshAppointmentsCache();
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void resolveHydratedSession().then((session) => {
      if (active) setSession(session);
    });
    void Promise.allSettled([refreshDentalCaches(), refreshSchedule()]).then(() => {
      if (!active) return;
      initialSyncDoneRef.current = true;
      setDataRev((rev) => rev + 1);
    });
    return () => { active = false; };
  }, [refreshSchedule]);

  useEffect(() => {
    const bump = () => setDataRev((x) => x + 1);
    const syncFresh = () => {
      if (document.visibilityState === "visible") {
        void refreshAppointmentsCache();
      }
    };
    const poll = setInterval(syncFresh, 10000);
    window.addEventListener("appointmentsUpdated", bump);
    window.addEventListener("dentalClientsUpdated", bump);
    window.addEventListener("focus", syncFresh);
    document.addEventListener("visibilitychange", syncFresh);
    return () => {
      clearInterval(poll);
      window.removeEventListener("appointmentsUpdated", bump);
      window.removeEventListener("dentalClientsUpdated", bump);
      window.removeEventListener("focus", syncFresh);
      document.removeEventListener("visibilitychange", syncFresh);
    };
  }, []);

  useEffect(() => {
    const openSheet = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string" && id.trim()) {
        setSheetOpen({ patientId: id.trim() });
      }
    };
    window.addEventListener(DOCTOR_OPEN_PATIENT_MEDICAL_SHEET_EVENT, openSheet);
    return () => window.removeEventListener(DOCTOR_OPEN_PATIENT_MEDICAL_SHEET_EVENT, openSheet);
  }, []);

  const doctorName = session?.fullName?.trim() ?? "";

  const doctorAppointments = useMemo(() => {
    const clinic = getAllClinicAppointments();
    if (!doctorName) return [];
    return filterAppointmentsByDoctor(clinic, doctorName);
  }, [doctorName, dataRev]);

  type DoctorNotifItem = {
    key: string;
    kind: "confirm" | "cancel";
    title: string;
    detail: string;
    appointment: ClinicAppointment;
    sortMs: number;
  };

  const doctorNotifications = useMemo<DoctorNotifItem[]>(() => {
    const items: DoctorNotifItem[] = [];
    for (const a of doctorAppointments) {
      const pName = patientShortName(a.patientId);
      const dateStr = `${a.day} ${a.month}, ${a.time}`;
      const aptMs = new Date(a.year, a.monthNum - 1, a.day).getTime();

      if (a.confirmedAt && a.status !== "cancelled") {
        const parsedMs = Date.parse(a.confirmedAt);
        items.push({
          key: `confirm:${a.id}:${a.confirmedAt}`,
          kind: "confirm",
          title: `Клиент ${pName} подтвердил запись`,
          detail: `${dateStr} · ${a.service}`,
          appointment: a,
          sortMs: Number.isFinite(parsedMs) ? parsedMs : aptMs,
        });
      }

      if (a.status === "cancelled" && a.cancelledBy !== "doctor") {
        items.push({
          key: `cancel:${a.id}`,
          kind: "cancel",
          title: `Клиент ${pName} отменил запись`,
          detail: `${dateStr} · ${a.service}`,
          appointment: a,
          sortMs: aptMs,
        });
      }
    }
    items.sort((x, y) => y.sortMs - x.sortMs);
    return items;
  }, [doctorAppointments]);

  const seenSet = useMemo(() => new Set(seenNotifKeys), [seenNotifKeys]);

  const unreadNotifications = useMemo(
    () => doctorNotifications.filter((n) => !seenSet.has(n.key)),
    [doctorNotifications, seenSet],
  );

  const seededInitialToastsRef = useRef(false);

  // Живой Toast, если во время работы в кабинете пришло новое подтверждение или отмена
  useEffect(() => {
    if (!doctorName || !initialSyncDoneRef.current) return;
    if (!seededInitialToastsRef.current) {
      seededInitialToastsRef.current = true;
      for (const n of doctorNotifications) {
        toastedNotifKeysRef.current.add(n.key);
      }
      return;
    }
    const fresh: DoctorNotifItem[] = [];
    for (const n of doctorNotifications) {
      if (!toastedNotifKeysRef.current.has(n.key)) {
        toastedNotifKeysRef.current.add(n.key);
        if (!seenSet.has(n.key)) {
          fresh.push(n);
        }
      }
    }
    if (fresh.length > 0) {
      const first = fresh[0]!;
      showToast(
        `${first.title} (${first.appointment.day} ${first.appointment.month}, ${first.appointment.time})`,
        first.kind === "cancel" ? "error" : "success",
      );
    }
  }, [doctorNotifications, doctorName, seenSet, showToast]);

  const markNotificationRead = useCallback(
    (key: string) => {
      if (seenSet.has(key)) return;
      persistSeenKeys([...seenNotifKeys, key]);
    },
    [seenSet, seenNotifKeys, persistSeenKeys],
  );

  const markAllNotificationsRead = useCallback(() => {
    const merged = Array.from(
      new Set([...seenNotifKeys, ...doctorNotifications.map((n) => n.key)]),
    );
    persistSeenKeys(merged);
  }, [seenNotifKeys, doctorNotifications, persistSeenKeys]);

  const jumpToNotificationAppointment = useCallback(
    (item: DoctorNotifItem) => {
      markNotificationRead(item.key);
      const a = item.appointment;
      setViewMonth(new Date(a.year, a.monthNum - 1, 1));
      setSelectedDate(new Date(a.year, a.monthNum - 1, a.day));
      setCabinetTab("calendar");
      setNotificationsOpen(false);
    },
    [markNotificationRead],
  );

  const daysWithDots = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const set = new Set<number>();
    doctorAppointments.forEach((a) => {
      if (a.year === y && a.monthNum === m + 1) set.add(a.day);
    });
    return set;
  }, [doctorAppointments, viewMonth]);

  const dayAgenda = useMemo(() => {
    return doctorAppointments
      .filter((a) => isSameCalendarDay(a, selectedDate))
      .sort(sortAppointmentsByTimeAsc);
  }, [doctorAppointments, selectedDate]);

  const todayAgenda = useMemo(() => {
    return doctorAppointments
      .filter((a) => isSameCalendarDay(a, anchor))
      .sort(sortAppointmentsByTimeAsc);
  }, [doctorAppointments, anchor]);

  const todayStats = useMemo(() => {
    const total = todayAgenda.length;
    const completed = todayAgenda.filter((a) => a.status === "completed").length;
    const nowMinutes = anchor.getHours() * 60 + anchor.getMinutes();
    const next =
      todayAgenda.find((a) => {
        if (a.status !== "scheduled" && a.status !== "pending" && a.status !== "rescheduled") {
          return false;
        }
        const [h, m] = a.time.split(":").map((x) => parseInt(x, 10));
        const mins = (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
        return mins >= nowMinutes;
      }) ?? null;
    return { total, completed, next };
  }, [todayAgenda, anchor]);

  const recentChatPreviews = useMemo(() => chatPreviews.slice(0, 3), [chatPreviews]);

  const doctorInitial = (session?.fullName?.trim().charAt(0) ?? "В").toUpperCase();

  const handleDesktopNav = useCallback((id: DesktopNavId) => {
    switch (id) {
      case "schedule":
        setCabinetTab("calendar");
        break;
      case "chats":
        setCabinetTab("chats");
        setDoctorChatsScope("colleagues");
        break;
      case "patients":
        setCabinetTab("patients");
        break;
      case "settings":
        setCabinetTab("settings");
        break;
    }
  }, []);

  const isDesktopNavActive = useCallback(
    (id: DesktopNavId): boolean => {
      switch (id) {
        case "schedule":
          return cabinetTab === "calendar";
        case "chats":
          return cabinetTab === "chats" && doctorChatsScope === "colleagues";
        case "patients":
          return cabinetTab === "patients";
        case "settings":
          return cabinetTab === "settings";
      }
    },
    [cabinetTab, doctorChatsScope]
  );

  const handleSelectCalendarDay = useCallback(
    (day: number) => {
      setSelectedDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
    },
    [viewMonth]
  );

  const goPrevMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleLogout = () => {
    logout();
    router.replace(ROUTES.auth);
  };

  const openRescheduleModal = useCallback((a: ClinicAppointment) => {
    setRescheduleTarget(a);
    const iso = `${a.year}-${String(a.monthNum).padStart(2, "0")}-${String(a.day).padStart(2, "0")}`;
    setRescheduleIso(iso);
    setRescheduleTimePick(a.time);
  }, []);

  const closeRescheduleModal = useCallback(() => {
    setRescheduleTarget(null);
  }, []);

  const confirmReschedule = useCallback(async () => {
    if (!rescheduleTarget) return;
    const a = rescheduleTarget;
    const parts = rescheduleIso.split("-").map((x) => parseInt(x, 10));
    const year = parts[0];
    const monthNum = parts[1];
    const day = parts[2];
    if (!year || !monthNum || !day || Number.isNaN(year) || Number.isNaN(monthNum) || Number.isNaN(day)) {
      showToast("Выберите корректную дату", "error");
      return;
    }
    setAgendaActionId(a.id);
    try {
      await rescheduleAppointment(a.id, {
        day,
        monthNum,
        month: RU_MONTHS_SHORT[monthNum - 1] ?? "",
        year,
        time: rescheduleTimePick,
      });
      closeRescheduleModal();
      showToast("Время приёма обновлено");
      postAppointmentNotifyAsync("doctor_reschedule", a.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      showToast(msg, "error");
    } finally {
      setAgendaActionId(null);
    }
  }, [
    rescheduleTarget,
    rescheduleIso,
    rescheduleTimePick,
    closeRescheduleModal,
    showToast,
  ]);

  const handleDoctorCancel = useCallback(
    async (a: ClinicAppointment) => {
      if (!a.patientId) {
        showToast("Нет привязки к карте пациента", "error");
        return;
      }
      if (!window.confirm("Отменить этот приём? Пациент получит уведомление в Telegram (если есть telegram_id).")) {
        return;
      }
      setAgendaActionId(a.id);
      try {
        await cancelAppointment(a.id);
        showToast("Запись отменена");
        postAppointmentNotifyAsync("doctor_cancel", a.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка";
        showToast(msg, "error");
      } finally {
        setAgendaActionId(null);
      }
    },
    [showToast]
  );

  const todayStr = formatScheduleHeaderDateStable(anchor);
  const selectedStr = formatScheduleHeaderDateStable(selectedDate);

  const desktopNavItems: { id: DesktopNavId; label: string }[] = [
    { id: "schedule", label: "Расписание" },
    { id: "chats", label: "Чаты" },
    { id: "patients", label: "Пациенты" },
    { id: "settings", label: "Настройки" },
  ];

  const renderHeaderActions = () => (
    <div className="layout-top-bar-actions flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => setNotificationsOpen((prev) => !prev)}
        className={`relative interactive-press-sm w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] ${
          notificationsOpen
            ? "border-primary bg-primary-light text-primary"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-secondary"
        }`}
        title="Уведомления"
        aria-label={`Уведомления${unreadNotifications.length > 0 ? `: ${unreadNotifications.length} новых` : ""}`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadNotifications.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
            {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
          </span>
        )}
      </button>
      <ThemeToggleButton />
      <button
        type="button"
        onClick={handleLogout}
        className="interactive-press-sm w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-secondary flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        title="Выйти"
        aria-label="Выйти"
      >
        <LogOut className="w-[18px] h-[18px]" />
      </button>
    </div>
  );

  const selectedIsToday = selectedDate.toDateString() === anchor.toDateString();
  const nextVisit = selectedIsToday ? todayStats.next : null;
  const completed = dayAgenda.filter((a) => a.status === "completed");
  const visibleAgenda = [
    ...(nextVisit ? [nextVisit] : []),
    ...dayAgenda.filter((a) => a.id !== nextVisit?.id && (showCompleted || a.status !== "completed")),
  ];
  const nextDate = doctorAppointments
    .filter((a) => isAppointmentDoctorEditable(a.status))
    .map((a) => new Date(a.year, a.monthNum - 1, a.day))
    .filter((date) => date > selectedDate)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const patients = [...new Set(doctorAppointments.flatMap((a) => a.patientId ? [a.patientId] : []))]
    .map((id) => {
      const patient = resolveDentalClientFromCacheSync(id);
      return { id, name: patient ? `${patient.lastName} ${patient.firstName}`.trim() : patientShortName(id) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .filter((p) => p.name.toLocaleLowerCase("ru").includes(patientQuery.trim().toLocaleLowerCase("ru")));

  function selectScheduleDate(date: Date) {
    setSelectedDate(date);
    setViewMonth(startOfMonth(date));
    setShowCompleted(false);
  }

  const renderDayPlan = (agenda: ClinicAppointment[], dateLabel: string) => (
    <>
      <div className={`layout-dayplan-heading flex items-baseline justify-between gap-2 mt-4 mb-3`}>
        <h2 className="text-[16px] font-bold text-[#0F172A] dark:text-white">План на день</h2>
        <p className="text-[12px] text-secondary text-right leading-tight">{dateLabel}</p>
      </div>

      <div className="flex flex-col gap-2 pb-3">
        {scheduleLoading ? (
          <p role="status" className="text-sm text-secondary">Загружаем расписание…</p>
        ) : !hasAppointmentsCache() ? (
          <button type="button" className="min-h-11 text-primary" onClick={() => void refreshSchedule()}>
            Не удалось загрузить расписание. Повторить
          </button>
        ) : dayAgenda.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] dark:border-slate-700 px-4 py-8 text-center">
            <p className="text-[14px] text-secondary">На выбранную дату нет записей к этому врачу.</p>
            {nextDate && (
              <button type="button" className="min-h-11 text-primary" onClick={() => selectScheduleDate(nextDate)}>
                К следующему дню с записью
              </button>
            )}
          </div>
        ) : (
          agenda.map((a: ClinicAppointment) => {
            const disabled = !a.patientId;
            const busy = agendaActionId === a.id;
            const canEdit = Boolean(a.patientId && isAppointmentDoctorEditable(a.status));
            const isNext = a.id === nextVisit?.id;
            return (
              <div
                key={a.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-[0_4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]"
              >
                {isNext && <p className="mb-2 text-sm font-semibold text-primary">Ближайший приём</p>}
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => a.patientId && setSheetOpen({ patientId: a.patientId, appointment: a })}
                  className={`text-left w-full transition-all duration-150 ease-out ${
                    disabled ? "opacity-60 cursor-not-allowed" : "active:scale-[0.99]"
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="text-[18px] font-bold text-primary tabular-nums shrink-0">{a.time}</span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                        a.status === "cancelled"
                          ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200/80 dark:border-red-800/50"
                          : a.confirmedAt
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50"
                            : "bg-[#F1F5F9] dark:bg-slate-800 text-secondary"
                      }`}
                    >
                      {appointmentStatusLabelRu(a.status, {
                        confirmedAt: a.confirmedAt,
                        cancelledBy: a.cancelledBy,
                      })}
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mt-1">
                    {patientShortName(a.patientId)}
                  </p>
                  <p className="text-[13px] text-secondary mt-1 leading-snug">{a.service}</p>
                  {!disabled && <span className="mt-2 inline-block text-sm font-semibold text-primary">Открыть карту</span>}
                  {a.visitMode === "video" && (
                    <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-light text-primary">
                      Онлайн
                    </span>
                  )}
                  {!a.patientId && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                      Карта не привязана
                    </p>
                  )}
                </button>
                {busy && (
                  <p className="text-[11px] font-semibold text-primary mt-2">Отправка в базу…</p>
                )}
                {canEdit && !busy && (
                  <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {a.visitMode === "video" && canJoinVideoWindow(a) && (
                      <button
                        type="button"
                        onClick={() => router.push(`/consultation/${a.id}`)}
                        className="w-full h-11 rounded-[10px] text-[12px] font-semibold bg-primary text-white active:scale-[0.98]"
                      >
                        Начать видеоконсультацию
                      </button>
                    )}
                    <details>
                      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
                        Действия с записью
                      </summary>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openRescheduleModal(a)}
                          className="flex-1 h-11 rounded-[10px] text-[12px] font-semibold border border-primary/30 bg-primary-light text-primary active:scale-[0.98] flex items-center justify-center"
                        >
                          Перенести
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDoctorCancel(a)}
                          className="flex-1 h-11 rounded-[10px] text-[12px] font-semibold border border-slate-200 dark:border-slate-600 text-secondary active:scale-[0.98] flex items-center justify-center"
                        >
                          Отменить
                        </button>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <main
      className="layout-doctor-cabinet min-h-dvh bg-surface dark:bg-app-canvas pb-page-end flex flex-col"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      <div className="layout-top-bar px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-2">
        <div className="layout-top-bar-brand flex items-center gap-2 min-w-0">
          {clinicSettings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clinicSettings.logoUrl}
              alt=""
              className="w-8 h-8 rounded-lg object-contain shrink-0"
            />
          ) : null}
          <p className="text-[15px] font-bold text-[#0F172A] dark:text-white truncate">
            {clinicSettings.displayName}
          </p>
        </div>
        {renderHeaderActions()}
      </div>

      <div className="layout-doctor-shell w-full flex-1 min-h-0">
        <aside className="layout-sidebar px-5 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center text-[18px] font-bold text-primary shrink-0 mb-3">
              {doctorInitial}
            </div>
            <p className="text-[15px] font-bold text-[#0F172A] dark:text-white leading-tight">
              {session?.fullName ?? "Врач"}
            </p>
            {session?.specialization ? (
              <p className="text-[13px] text-secondary mt-1">{session.specialization}</p>
            ) : null}
          </div>

          <nav className="layout-sidebar-nav flex flex-col gap-1" aria-label="Навигация кабинета">
            {desktopNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleDesktopNav(item.id)}
                className={`layout-sidebar-nav-item flex h-9 min-h-9 items-center px-3 py-0 w-full rounded-lg text-[13px] font-semibold transition-colors text-left shrink-0 leading-none ${
                  isDesktopNavActive(item.id)
                    ? "bg-primary text-white shadow-[0_4px_12px_rgba(36,139,207,0.35)]"
                    : "text-secondary dark:text-slate-400 bg-transparent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="layout-container max-w-[480px] mx-auto px-5 pt-[calc(env(safe-area-inset-top,0px)+3rem)] w-full flex flex-col flex-1 min-h-0">
        <header className="layout-mobile-header flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-1">
              Личный кабинет врача
            </p>
            <h1 className="text-[24px] font-bold text-[#0F172A] dark:text-white leading-tight">
              {session?.fullName ?? "Врач"}
            </h1>
            {session?.specialization ? (
              <p className="text-[14px] text-secondary mt-1">{session.specialization}</p>
            ) : null}
            <p className="text-[13px] text-secondary mt-3 leading-snug">{todayStr}</p>
          </div>
          {renderHeaderActions()}
        </header>

        <div
          role="tablist"
          aria-label="Разделы кабинета"
          className="layout-tab-bar flex rounded-2xl p-1 mb-5 bg-primary-light/90 dark:bg-slate-800/90 border border-primary/20 dark:border-primary/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-none"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cabinetTab === "calendar"}
            id="doctor-tab-calendar"
            onClick={() => setCabinetTab("calendar")}
            className={`flex-1 h-10 rounded-xl text-[14px] font-semibold transition-colors ${
              cabinetTab === "calendar"
                ? "bg-primary text-white shadow-[0_4px_12px_rgba(36,139,207,0.35)]"
                : "text-secondary dark:text-slate-400 bg-transparent"
            }`}
          >
            Приёмы
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cabinetTab === "chats"}
            id="doctor-tab-chats"
            onClick={() => setCabinetTab("chats")}
            className={`flex-1 h-10 rounded-xl text-[14px] font-semibold transition-colors ${
              cabinetTab === "chats"
                ? "bg-primary text-white shadow-[0_4px_12px_rgba(36,139,207,0.35)]"
                : "text-secondary dark:text-slate-400 bg-transparent"
            }`}
          >
            Чаты
          </button>
          <button type="button" role="tab" aria-selected={cabinetTab === "patients"}
            onClick={() => setCabinetTab("patients")}
            className={`flex-1 min-h-11 rounded-xl text-sm font-semibold ${cabinetTab === "patients" ? "bg-primary text-white" : "text-secondary"}`}>
            Пациенты
          </button>
        </div>

        {(notificationsOpen || unreadNotifications.length > 0) && (
          <section
            aria-label="Уведомления о записях"
            className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 text-primary shrink-0" />
                <h2 className="text-[14px] font-bold text-[#0F172A] dark:text-white truncate">
                  Уведомления
                </h2>
                {unreadNotifications.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary-light text-primary text-[11px] font-bold tabular-nums">
                    {unreadNotifications.length} новых
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {unreadNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[12px] font-semibold text-primary hover:underline"
                  >
                    Прочитано
                  </button>
                )}
                {notificationsOpen && (
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[12px] font-medium text-secondary hover:text-[#0F172A] dark:hover:text-white"
                  >
                    Скрыть
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const list = notificationsOpen
                ? doctorNotifications.slice(0, 10)
                : unreadNotifications.slice(0, 5);
              if (list.length === 0) {
                return (
                  <p className="text-[13px] text-secondary py-2">
                    Новых уведомлений о подтверждениях и отменах пока нет.
                  </p>
                );
              }
              return (
                <ul className="space-y-2">
                  {list.map((n) => {
                    const isUnread = !seenSet.has(n.key);
                    return (
                      <li key={n.key}>
                        <button
                          type="button"
                          onClick={() => jumpToNotificationAppointment(n)}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                            isUnread
                              ? n.kind === "cancel"
                                ? "border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20"
                                : "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
                          }`}
                        >
                          {n.kind === "cancel" ? (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#0F172A] dark:text-white leading-snug">
                              {n.title}
                            </p>
                            <p className="text-[12px] text-secondary mt-0.5 truncate">
                              {n.detail}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </section>
        )}

        {cabinetTab === "settings" ? (
          <div className="layout-settings-view pb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-1">Аккаунт</p>
            <h2 className="text-[20px] font-bold text-[#0F172A] dark:text-white mb-5">Настройки</h2>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]">
              <p className="text-[12px] text-secondary">ФИО</p>
              <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mt-1">
                {session?.fullName ?? "Врач"}
              </p>
              {session?.specialization ? (
                <>
                  <p className="text-[12px] text-secondary mt-4">Специализация</p>
                  <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mt-1">
                    {session.specialization}
                  </p>
                </>
              ) : null}
              {session?.phone ? (
                <>
                  <p className="text-[12px] text-secondary mt-4">Телефон</p>
                  <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mt-1 tabular-nums">
                    {session.phone}
                  </p>
                </>
              ) : null}
              <p className="text-[12px] text-secondary mt-4">Клиника</p>
              <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mt-1">
                {clinicSettings.displayName}
              </p>
            </div>
          </div>
        ) : cabinetTab === "calendar" ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" aria-expanded={calendarOpen} onClick={() => setCalendarOpen(!calendarOpen)}
                className="min-h-11 rounded-xl border border-primary/30 px-3 text-sm font-semibold text-primary">
                {selectedIsToday ? "Сегодня · " : ""}{selectedStr}
              </button>
              {!selectedIsToday && (
                <button type="button" className="min-h-11 px-2 text-sm text-primary" onClick={() => selectScheduleDate(anchor)}>Сегодня</button>
              )}
            </div>
            {selectedIsToday && !scheduleLoading && hasAppointmentsCache() && dayAgenda.length > 0 && (
              <p className="mb-3 text-sm text-secondary">
                Приёмов: {dayAgenda.length} · завершено: {completed.length}
                {dayAgenda.every((a) => a.status === "completed" || a.status === "cancelled") && " · На сегодня всё"}
              </p>
            )}
            <div className={calendarOpen ? "layout-schedule-area" : undefined}>
              {calendarOpen && (
                <div className="layout-calendar-col min-w-0 max-w-full">
                  <DoctorMonthCalendar
                    viewMonth={viewMonth}
                    selectedDate={selectedDate}
                    clientNow={anchor}
                    daysWithAppointments={daysWithDots}
                    onSelectDay={(day) => { handleSelectCalendarDay(day); setShowCompleted(false); }}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                  />
                </div>
              )}
              <div className="layout-dayplan-col min-w-0">
                {renderDayPlan(visibleAgenda, selectedStr)}
                {completed.length > 0 && (
                  <button type="button" aria-expanded={showCompleted} className="min-h-11 text-sm font-semibold text-primary"
                    onClick={() => setShowCompleted(!showCompleted)}>
                    {showCompleted ? "Скрыть завершённые" : `Показать завершённые (${completed.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : cabinetTab === "patients" ? (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Пациенты</h2>
            <input type="search" aria-label="Поиск пациента по имени" placeholder="Имя или фамилия"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:bg-slate-900"
              value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            {patients.length === 0 && <p className="text-sm text-secondary">Пациенты не найдены</p>}
            <ul className="space-y-2">
              {patients.map(({ id, name }) => (
                <li key={id}>
                  <button type="button" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-left"
                    onClick={() => setSheetOpen({ patientId: id })}>{name}</button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="layout-chats-view flex flex-col flex-1 min-h-0 pb-8 gap-4">
            <div
              role="tablist"
              aria-label="Тип чатов"
              className="flex rounded-2xl p-1.5 bg-primary-light/90 dark:bg-slate-800/90 border border-primary/20 dark:border-primary/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-none shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={doctorChatsScope === "colleagues"}
                onClick={() => setDoctorChatsScope("colleagues")}
                className={`interactive-press-sm flex-1 min-h-[48px] rounded-[14px] text-[15px] font-semibold transition-colors duration-200 px-2 ${
                  doctorChatsScope === "colleagues"
                    ? "bg-primary text-white shadow-[0_4px_12px_rgba(36,139,207,0.35)]"
                    : "text-secondary bg-transparent dark:text-[#9AB0C5]"
                }`}
              >
                Коллеги
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={doctorChatsScope === "patients"}
                onClick={() => setDoctorChatsScope("patients")}
                className={`interactive-press-sm flex-1 min-h-[48px] rounded-[14px] text-[15px] font-semibold transition-colors duration-200 px-2 ${
                  doctorChatsScope === "patients"
                    ? "bg-primary text-white shadow-[0_4px_12px_rgba(36,139,207,0.35)]"
                    : "text-secondary bg-transparent dark:text-[#9AB0C5]"
                }`}
              >
                Пациенты
              </button>
            </div>

            {doctorChatsScope === "colleagues" ? (
              <div className="flex flex-col flex-1 min-h-0">
                <DoctorOrdinatorskayaChat session={session} showToast={showToast} />
              </div>
            ) : (
              <div key="doctor-patient-chats" className="flex flex-col flex-1 min-h-0">
                <StaffMessagesPage mode="doctor" embedded />
              </div>
            )}
          </div>
        )}
        </div>

        <aside className="layout-right-panel px-5 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-8">
          <div className="layout-right-panel-stats flex flex-col gap-3 mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-secondary">Сегодня</p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-[0_4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]">
              <p className="text-[12px] text-secondary">Всего приёмов</p>
              <p className="text-[22px] font-bold text-[#0F172A] dark:text-white tabular-nums">{todayStats.total}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-[0_4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]">
              <p className="text-[12px] text-secondary">Завершено</p>
              <p className="text-[22px] font-bold text-[#0F172A] dark:text-white tabular-nums">{todayStats.completed}</p>
            </div>

          </div>

          <div className="layout-right-panel-chats">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-secondary">Недавние чаты</p>
              <button
                type="button"
                onClick={() => handleDesktopNav("chats")}
                className="text-[11px] font-semibold text-primary"
              >
                Все
              </button>
            </div>
            <ul className="space-y-2">
              {recentChatPreviews.length === 0 ? (
                <li className="text-[13px] text-secondary py-6 text-center border border-dashed border-gray-200 dark:border-slate-700 rounded-[14px]">
                  Нет активных диалогов
                </li>
              ) : (
                recentChatPreviews.map((p) => (
                  <li key={`${p.patientId}_${p.scope}`}>
                    <button
                      type="button"
                      onClick={() => { setCabinetTab("chats"); setDoctorChatsScope("patients"); }}
                      className="interactive-press-sm w-full text-left rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 flex gap-3 items-start shadow-[0_4px_14px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-[13px] font-bold text-primary shrink-0">
                        {p.patientName.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-semibold text-[#0F172A] dark:text-white truncate">
                            {p.patientName}
                          </p>
                          {p.unread ? (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Непрочитано" />
                          ) : null}
                        </div>
                        <p className="text-[12px] text-secondary truncate mt-0.5">
                          {p.lastMessage
                            ? `${p.lastMessage.senderRole === "client" ? "Пациент: " : ""}${p.lastMessage.text}`
                            : "—"}
                        </p>
                        {p.lastMessage ? (
                          <p className="text-[10px] text-secondary mt-1 tabular-nums">
                            {formatChatPreviewTime(p.lastMessage.timestamp)}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </div>

      {sheetOpen && (
        <PatientMedicalSheet
          key={sheetOpen.patientId}
          patientId={sheetOpen.patientId}
          contextAppointment={sheetOpen.appointment ?? null}
          onClose={() => setSheetOpen(null)}
        />
      )}

      {rescheduleTarget && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center p-4 bg-black/45 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0"
            aria-label="Закрыть"
            onClick={closeRescheduleModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[1] w-full max-w-[400px] rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-1">Перенос приёма</p>
            <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white mb-4">
              {patientShortName(rescheduleTarget.patientId)} · {rescheduleTarget.service}
            </p>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Дата</label>
            <input
              type="date"
              value={rescheduleIso}
              onChange={(e) => setRescheduleIso(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-[14px] mb-4"
            />
            <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Время</label>
            <select
              value={rescheduleTimePick}
              onChange={(e) => setRescheduleTimePick(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-[14px] mb-5"
            >
              {clinicTimeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeRescheduleModal}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-600 text-[14px] font-semibold text-secondary"
              >
                Закрыть
              </button>
              <button
                type="button"
                disabled={!!agendaActionId}
                onClick={() => void confirmReschedule()}
                className="flex-1 h-11 rounded-xl bg-primary text-white text-[14px] font-semibold shadow-[0_4px_14px_rgba(36,139,207,0.35)] disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast variant="staffPlain" message={toastMessage} visible={toastVisible} tone={toastTone} />
    </main>
  );
}

"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import BottomBar from "@/components/layout/BottomBar";
import { getProfile } from "@/lib/userProfile";
import {
  getPatientCabinetSummary,
  isPatientCabinetReady,
  loadPatientCabinetCore,
  type PatientCabinetSummary,
} from "@/lib/patientCabinet";
import { formatRuNumericLongDateStable } from "@/lib/doctorSchedule";

interface CabinetSectionItem {
  href: string;
  title: string;
  subtitle: string;
  meta?: string;
  icon: React.ReactNode;
}

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function CabinetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-32 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
      <div className="h-24 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
      <div className="h-56 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
    </div>
  );
}

export default function PatientCabinetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [summary, setSummary] = useState<PatientCabinetSummary | null>(null);

  const syncName = useCallback(() => {
    const profile = getProfile();
    setFirstName(profile.firstName.trim());
    setLastName(profile.lastName.trim());
  }, []);

  useLayoutEffect(() => {
    syncName();
    if (isPatientCabinetReady()) {
      setSummary(getPatientCabinetSummary());
      setLoading(false);
    }
  }, [syncName]);

  const refresh = useCallback(async () => {
    const data = await loadPatientCabinetCore();
    setSummary(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    syncName();
    void refresh();

    const subRoutes = [
      "/treatment-plan",
      "/treatment-history",
      "/documents",
      "/prevention",
      "/profile",
    ];
    for (const r of subRoutes) {
      router.prefetch(r);
    }

    const dataEvents = [
      "patientVisitsUpdated",
      "medicalRecordsUpdated",
      "patientFilesUpdated",
      "treatmentPlanUpdated",
      "appointmentsUpdated",
    ] as const;

    const onDataUpdate = () => void refresh();
    dataEvents.forEach((e) => window.addEventListener(e, onDataUpdate));
    window.addEventListener("profileUpdated", syncName);

    return () => {
      dataEvents.forEach((e) => window.removeEventListener(e, onDataUpdate));
      window.removeEventListener("profileUpdated", syncName);
    };
  }, [refresh, router, syncName]);

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Пациент";
  const stats = summary?.planStats;
  const prevention = summary?.prevention;

  const sectionItems: CabinetSectionItem[] = summary
    ? [
        {
          href: "/treatment-plan",
          title: "План лечения",
          subtitle:
            (stats?.total ?? 0) > 0
              ? `${stats!.total} ${pluralizeRu(stats!.total, "этап", "этапа", "этапов")} · ${stats!.progressPercent}% выполнено`
              : "Этапы и стоимость лечения",
          icon: <ClipboardList className="w-5 h-5 text-primary" />,
        },
        {
          href: "/treatment-history",
          title: "История лечения",
          subtitle:
            summary.visitCount > 0 || summary.medicalRecords.length > 0
              ? `${summary.visitCount} ${pluralizeRu(summary.visitCount, "визит", "визита", "визитов")} · ${summary.medicalRecords.length} ${pluralizeRu(summary.medicalRecords.length, "запись", "записи", "записей")}`
              : "Визиты и медицинский архив",
          icon: <History className="w-5 h-5 text-primary" />,
        },
        {
          href: "/documents",
          title: "Документы и снимки",
          subtitle:
            summary.filesSummary.total > 0
              ? `${summary.filesSummary.xrays} ${pluralizeRu(summary.filesSummary.xrays, "снимок", "снимка", "снимков")} · ${summary.filesSummary.docs} ${pluralizeRu(summary.filesSummary.docs, "документ", "документа", "документов")}`
              : "Рентгены, фото и справки",
          meta: summary.filesSummary.total > 0 ? String(summary.filesSummary.total) : undefined,
          icon: <FileText className="w-5 h-5 text-primary" />,
        },
        {
          href: "/prevention",
          title: "Профилактика и рекомендации",
          subtitle:
            summary.recommendations.length > 0
              ? `${summary.recommendations.length} ${pluralizeRu(summary.recommendations.length, "рекомендация", "рекомендации", "рекомендаций")} врачей`
              : "График осмотров и уход",
          meta: summary.recommendations.length > 0 ? String(summary.recommendations.length) : undefined,
          icon: <ShieldCheck className="w-5 h-5 text-primary" />,
        },
      ]
    : [];

  return (
    <div className="min-h-dvh bg-surface dark:bg-app-canvas pb-safe">
      <Header
        title="Мой кабинет"
        rightSlot={
          <Link
            href="/profile"
            aria-label="Настройки профиля"
            className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 -mr-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </Link>
        }
      />

      <main className="px-5 pt-3 pb-28 flex flex-col gap-4 max-w-[480px] mx-auto">
        {/* Карточка пациента */}
        <div
          className="rounded-[20px] px-5 py-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #0D2347 0%, #1A3A6B 60%, #1E4580 100%)",
          }}
        >
          <div
            className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(circle, #3ECFFF 0%, transparent 70%)" }}
          />
          <p className="text-[12px] font-medium text-blue-200/80">
            Карточка пациента
          </p>
          <p className="text-[22px] font-bold text-white mt-1 leading-tight truncate">
            {fullName}
          </p>
          <p className="text-[13px] text-blue-200/75 mt-1">
            Медицинская карта, план и документы
          </p>
        </div>

        {loading || !summary ? (
          <CabinetSkeleton />
        ) : (
          <>
            {/* Прогресс лечения */}
            <Card className="border border-primary/15">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h2 className="text-[13px] font-bold text-[#0F172A] dark:text-white">
                  Прогресс лечения
                </h2>
                <Link
                  href="/treatment-plan"
                  className="text-[13px] font-semibold text-primary hover:underline whitespace-nowrap"
                >
                  Подробнее →
                </Link>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${stats?.progressPercent ?? 0}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[18px] font-bold text-primary tabular-nums">
                    {stats?.completed ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Выполнено</p>
                </div>
                <div>
                  <p className="text-[18px] font-bold text-amber-500 tabular-nums">
                    {stats?.inProgress ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">В процессе</p>
                </div>
                <div>
                  <p className="text-[18px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    {stats?.pending ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Ожидает</p>
                </div>
              </div>
            </Card>

            {/* Следующий осмотр */}
            {prevention && (
              <Card>
                <p className="text-[13px] font-bold text-[#0F172A] dark:text-white mb-2">
                  Следующий осмотр
                </p>
                <div className="flex justify-between items-baseline mb-2.5">
                  <p className="text-[24px] font-bold text-[#0F172A] dark:text-white tabular-nums">
                    {prevention.daysUntilNextVisit}{" "}
                    <span className="text-[14px] font-medium text-slate-500 dark:text-slate-400">
                      {pluralizeRu(prevention.daysUntilNextVisit, "день", "дня", "дней")}
                    </span>
                  </p>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatRuNumericLongDateStable(prevention.nextVisitDate)}
                  </p>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${prevention.progressPercent}%` }}
                  />
                </div>
              </Card>
            )}

            {/* Разделы кабинета (без дублирования нижней панели) */}
            <section>
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Разделы кабинета
              </h2>
              <Card padding="sm" className="px-4 py-1">
                {sectionItems.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 min-h-[60px] py-2.5 active:opacity-75 transition-opacity ${
                      idx < sectionItems.length - 1
                        ? "border-b border-slate-100 dark:border-slate-800"
                        : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary-light dark:bg-primary/15 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                    {item.meta && (
                      <span className="text-[13px] font-semibold text-primary tabular-nums shrink-0">
                        {item.meta}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  </Link>
                ))}
              </Card>
            </section>

            {/* Настройки профиля */}
            <Link
              href="/profile"
              className="interactive-press-sm flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[14px] font-semibold text-primary shadow-raised-surface"
            >
              <Settings className="w-4 h-4" />
              Настройки профиля
            </Link>
          </>
        )}
      </main>

      <BottomBar />
    </div>
  );
}

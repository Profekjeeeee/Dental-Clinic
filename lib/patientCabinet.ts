import { getCurrentUserId, getDentalSession } from "@/lib/auth";
import { hasAppointmentsCache } from "@/lib/appointments";
import { initBills, getBills, getTotalPending, hasBillsCache } from "@/lib/bills";
import { initMedicalRecords, getMedicalRecords, hasMedicalRecordsCache } from "@/lib/medicalRecords";
import { initPatientFiles, getPatientFiles, hasPatientFilesCache } from "@/lib/patientFiles";
import { initPatientVisits, getPatientVisits, hasPatientVisitsCache } from "@/lib/patientVisits";
import { getPatientPayments, PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { initPlanSources, getMergedPlanStats } from "@/lib/planUtils";
import { hasTreatmentPlanCache } from "@/lib/treatmentPlan";
import {
  buildPatientRecommendations,
  computePreventionSchedule,
  type PatientRecommendation,
} from "@/lib/patientRecommendations";
import type { TreatmentPlanStats } from "@/lib/treatmentPlan";
import type { MedicalRecord } from "@/lib/medicalRecords";
import type { PatientVisit } from "@/lib/patientVisits";
import type { PatientFile } from "@/lib/patientFiles";
import type { Payment } from "@/types";

export type { PatientRecommendation };

export interface PatientCabinetFinances {
  pendingAmount: number;
  pendingCount: number;
  paidCount: number;
  recentPayments: Payment[];
}

export interface PatientCabinetFilesSummary {
  total: number;
  xrays: number;
  docs: number;
}

export interface PatientCabinetSummary {
  planStats: TreatmentPlanStats;
  recentVisits: PatientVisit[];
  visitCount: number;
  medicalRecords: MedicalRecord[];
  filesSummary: PatientCabinetFilesSummary;
  recentFiles: PatientFile[];
  finances: PatientCabinetFinances;
  recommendations: PatientRecommendation[];
  prevention: ReturnType<typeof computePreventionSchedule>;
}

let initPromise: Promise<void> | null = null;
let initPromiseSubjectId: string | null = null;

function currentClientId(): string | null {
  const uid = getCurrentUserId();
  if (uid) return uid;
  const s = getDentalSession();
  return s?.role === "client" ? s.id : null;
}

/** Все основные источники данных кабинета уже в памяти для текущего пациента. */
export function isPatientCabinetReady(): boolean {
  if (!currentClientId()) return false;
  return (
    hasAppointmentsCache() &&
    hasTreatmentPlanCache() &&
    hasBillsCache() &&
    hasPatientVisitsCache() &&
    hasMedicalRecordsCache() &&
    hasPatientFilesCache(false)
  );
}

/** Параллельная инициализация всех источников данных кабинета (мгновенно при тёплом кэше). */
export async function initPatientCabinet(): Promise<void> {
  const subjectId = currentClientId();
  if (isPatientCabinetReady()) {
    // Каждый init* сам запустит фоновую SWR-ревалидацию, если его TTL истёк
    void Promise.all([
      initPlanSources(),
      initBills(),
      initPatientVisits(),
      initMedicalRecords(),
      initPatientFiles(),
    ]);
    return;
  }

  if (!initPromise || initPromiseSubjectId !== subjectId) {
    initPromiseSubjectId = subjectId;
    let run: Promise<void> | null = null;
    run = Promise.all([
      initPlanSources(),
      initBills(),
      initPatientVisits(),
      initMedicalRecords(),
      initPatientFiles(),
    ])
      .then(() => undefined)
      .finally(() => {
        if (initPromise === run) {
          initPromise = null;
        }
      });
    initPromise = run;
  }
  await initPromise;
}

/** Фоновый прогрев кэша — вызывать на главной / при наведении на вкладку. */
export function prefetchPatientCabinet(): void {
  if (typeof window === "undefined") return;
  void initPatientCabinet();
  void getPatientPayments();
}

export function resetPatientCabinetCache(): void {
  initPromise = null;
  initPromiseSubjectId = null;
}

export function getPatientCabinetSummary(): PatientCabinetSummary {
  const visits = getPatientVisits();
  const records = getMedicalRecords();
  const files = getPatientFiles();
  const bills = getBills();

  const xrays = files.filter(
    (f) => f.fileCategory === "xray" || f.fileCategory === "photo",
  ).length;
  const docs = files.length - xrays;

  const pendingBills = bills.filter(
    (b) => b.status === "pending" || b.status === "overdue" || b.status === "partial",
  );

  return {
    planStats: getMergedPlanStats(),
    recentVisits: visits.slice(0, 3),
    visitCount: visits.length,
    medicalRecords: records,
    filesSummary: { total: files.length, xrays, docs },
    recentFiles: files.slice(0, 2),
    finances: {
      pendingAmount: getTotalPending(bills),
      pendingCount: pendingBills.length,
      paidCount: bills.filter((b) => b.status === "paid").length,
      recentPayments: [],
    },
    recommendations: buildPatientRecommendations(visits, records, 5),
    prevention: computePreventionSchedule(visits),
  };
}

/** Основные данные кабинета — без блокировки на платежах. */
export async function loadPatientCabinetCore(): Promise<PatientCabinetSummary> {
  await initPatientCabinet();
  return getPatientCabinetSummary();
}

/** Полная загрузка с историей платежей. */
export async function loadPatientCabinetSummary(): Promise<PatientCabinetSummary> {
  const [summary, payments] = await Promise.all([
    loadPatientCabinetCore(),
    getPatientPayments(),
  ]);
  summary.finances.recentPayments = payments.slice(0, 5);
  return summary;
}

export function formatPaymentLabel(payment: Payment): string {
  const method = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
  return `${payment.amount.toLocaleString("ru-RU")} ₽ · ${method}`;
}

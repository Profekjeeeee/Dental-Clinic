import type { Bill, BillItem } from "@/types";
import { getCurrentUserId, getDentalSession } from "@/lib/auth";
import { resolveClientIdForAppointment } from "@/lib/appointments";
import { createOnlinePayment } from "@/lib/payments";
import { formatErrorMessage } from "@/lib/formatErrorMessage";
import { supabase } from "@/lib/supabaseClient";

export type { Bill };


interface BillRow {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount: number | string;
  paid_amount: number | string;
  status: string;
  description: string;
  bill_number: string;
  due_date: string | null;
  metadata: {
    items?: BillItem[];
    can_pay_online?: boolean;
  } | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

function getClientSubjectIdForFilters(): string | null {
  const uid = getCurrentUserId();
  if (uid) return uid;
  const session = getDentalSession();
  if (session?.role === "client" && session.id) return session.id;
  return null;
}

function rowToBill(row: BillRow): Bill {
  const items = row.metadata?.items?.length
    ? row.metadata.items
    : [
        {
          id: `item-${row.id}`,
          service: row.description || "Медицинская услуга",
          quantity: 1,
          unitPrice: Number(row.amount),
          total: Number(row.amount),
          date: row.created_at.split("T")[0],
        },
      ];

  return {
    id: row.id,
    number: row.bill_number || `№ ${row.id.slice(0, 8)}`,
    patientId: row.patient_id,
    appointmentId: row.appointment_id ?? undefined,
    items,
    totalAmount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status as Bill["status"],
    issuedAt: row.created_at.split("T")[0],
    dueDate: row.due_date ?? undefined,
    paidAt: row.paid_at ?? undefined,
    canPayOnline: row.metadata?.can_pay_online ?? true,
  };
}

let billsCache: Bill[] | null = null;
let billsCacheSubjectId: string | null = null;
let lastBillsFetchedAt = 0;
let inFlightBillsRefresh: Promise<void> | null = null;
const BILLS_STALE_TTL_MS = 15_000;
const BILLS_COALESCE_MS = 2_500;

export function hasBillsCache(): boolean {
  const subjectId = getClientSubjectIdForFilters();
  return billsCache !== null && billsCacheSubjectId === subjectId;
}

function dispatchBillsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("billsUpdated"));
}

export async function refreshBillsCache(force = false): Promise<void> {
  const subjectId = getClientSubjectIdForFilters();
  if (
    !force &&
    billsCache !== null &&
    billsCacheSubjectId === subjectId &&
    Date.now() - lastBillsFetchedAt < BILLS_COALESCE_MS
  ) {
    return;
  }
  if (!force && inFlightBillsRefresh) {
    return inFlightBillsRefresh;
  }

  let run: Promise<void> | null = null;
  run = (async () => {
    try {
      let query = supabase.from("bills").select("*");
      if (subjectId) {
        query = query.eq("patient_id", subjectId);
      }
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        console.error("[bills]", error);
        return;
      }

      billsCache = ((data ?? []) as BillRow[]).map(rowToBill);
      billsCacheSubjectId = subjectId;
      lastBillsFetchedAt = Date.now();
      dispatchBillsUpdated();
    } finally {
      if (inFlightBillsRefresh === run) {
        inFlightBillsRefresh = null;
      }
    }
  })();

  inFlightBillsRefresh = run;
  return run;
}

async function resolvePatientIdForWrite(): Promise<string | null> {
  const uid = getCurrentUserId();
  if (uid) return uid;
  return resolveClientIdForAppointment();
}

export async function initBills(): Promise<Bill[]> {
  if (hasBillsCache()) {
    if (Date.now() - lastBillsFetchedAt >= BILLS_STALE_TTL_MS) {
      void refreshBillsCache(false);
    }
    return getBills();
  }
  await refreshBillsCache(false);
  return getBills();
}

export function getBills(): Bill[] {
  const subjectId = getClientSubjectIdForFilters();
  const all = billsCache ?? [];
  if (!subjectId) return [];
  return all.filter((b) => b.patientId === subjectId);
}

export async function addBillForAppointment(
  appointmentId: string,
  serviceName: string,
  price: number
): Promise<Bill> {
  const patientId = await resolvePatientIdForWrite();
  if (!patientId) {
    throw new Error("Не удалось определить пациента для счёта.");
  }

  const existing = (billsCache ?? []).find(
    (b) =>
      b.appointmentId === appointmentId &&
      (b.status === "pending" || b.status === "overdue")
  );
  if (existing) return existing;

  const bills = getBills();
  const now = new Date().toISOString().split("T")[0];
  const num = String(1000 + bills.length + 1).padStart(4, "0");
  const billNumber = `№ ${new Date().getFullYear()}-${num}`;
  const item: BillItem = {
    id: `item-apt-${appointmentId}`,
    service: serviceName,
    quantity: 1,
    unitPrice: price,
    total: price,
    date: now,
  };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const { data, error } = await supabase
    .from("bills")
    .insert([
      {
        patient_id: patientId,
        appointment_id: appointmentId,
        amount: price,
        paid_amount: 0,
        status: "pending",
        description: serviceName,
        bill_number: billNumber,
        due_date: dueDate.toISOString().split("T")[0],
        metadata: {
          items: [item],
          can_pay_online: true,
        },
      },
    ])
    .select("*")
    .single();

  if (error) throw new Error(formatErrorMessage(error));
  await refreshBillsCache(true);
  return rowToBill(data as BillRow);
}

export async function removeBillByAppointmentId(appointmentId: string): Promise<boolean> {
  const target = (billsCache ?? []).find(
    (b) =>
      b.appointmentId === appointmentId &&
      (b.status === "pending" || b.status === "overdue")
  );
  if (!target) return false;

  const { error } = await supabase.from("bills").delete().eq("id", target.id);
  if (error) {
    console.error("[bills] remove", error);
    return false;
  }

  await refreshBillsCache(true);
  return true;
}

export async function payBillById(id: string): Promise<void> {
  const bill = (billsCache ?? []).find((b) => b.id === id);
  if (!bill) return;

  const result = await createOnlinePayment(id);

  if (result.confirmationUrl && typeof window !== "undefined") {
    window.location.href = result.confirmationUrl;
    return;
  }

  if (result.status !== "succeeded") {
    throw new Error("Платёж не завершён. Попробуйте позже.");
  }

  await refreshBillsCache(true);
}

export async function payAllPendingBills(): Promise<void> {
  const pending = getBills().filter(
    (b) => b.status === "pending" || b.status === "overdue" || b.status === "partial"
  );
  for (const bill of pending) {
    await payBillById(bill.id);
  }
}

export function getTotalPending(bills: Bill[]): number {
  return bills
    .filter((b) => b.status === "pending" || b.status === "overdue" || b.status === "partial")
    .reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0);
}

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatBillDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

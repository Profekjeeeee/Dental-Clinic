import { NextResponse } from "next/server";

import { getSupabaseServiceRole } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const ACTIVE_BOOKING_STATUSES = ["pending", "scheduled", "rescheduled"];

function normalizeDoctor(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTimeSlot(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]!.padStart(2, "0")}:${m[2]!}`;
}

/**
 * GET /api/appointments/booked?doctor=...&year=2026&month=11&excludeId=...
 * Возвращает занятые слоты (только дата и время, без персональных данных).
 * Отменённые (`status = 'cancelled'`) и завершённые не блокируют расписание.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const doctorParam = normalizeDoctor(url.searchParams.get("doctor"));
  const excludeId = url.searchParams.get("excludeId")?.trim() || null;
  const yearRaw = Number(url.searchParams.get("year"));
  const monthRaw = Number(url.searchParams.get("month"));

  const sb = getSupabaseServiceRole();
  let query = sb
    .from("appointments")
    .select("id, doctor_name, appointment_date, appointment_time, status")
    .in("status", ACTIVE_BOOKING_STATUSES);

  if (
    Number.isInteger(yearRaw) &&
    Number.isInteger(monthRaw) &&
    monthRaw >= 1 &&
    monthRaw <= 12
  ) {
    const mm = String(monthRaw).padStart(2, "0");
    const lastDay = new Date(yearRaw, monthRaw, 0).getDate();
    const startIso = `${yearRaw}-${mm}-01`;
    const endIso = `${yearRaw}-${mm}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("appointment_date", startIso).lte("appointment_date", endIso);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[appointments/booked]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slots: Array<{ date: string; time: string }> = [];
  for (const row of data ?? []) {
    const rec = row as {
      id?: string | number | null;
      doctor_name?: string | null;
      appointment_date?: string | null;
      appointment_time?: string | null;
    };
    if (excludeId && rec.id != null && String(rec.id) === excludeId) {
      continue;
    }
    if (doctorParam && normalizeDoctor(rec.doctor_name) !== doctorParam) {
      continue;
    }
    if (!rec.appointment_date || !rec.appointment_time) continue;
    slots.push({
      date: String(rec.appointment_date).slice(0, 10),
      time: normalizeTimeSlot(rec.appointment_time),
    });
  }

  return NextResponse.json({ slots });
}

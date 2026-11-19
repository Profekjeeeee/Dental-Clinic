import "server-only";

export function parseClinicAppointmentTime(date: string, time: string): Date {
  const offset = process.env.CLINIC_TZ_OFFSET?.trim() || "+07:00";
  const normalizedTime = time.trim();
  const withSeconds = normalizedTime.length === 5 ? normalizedTime + ":00" : normalizedTime;
  return new Date(date + "T" + withSeconds + offset);
}

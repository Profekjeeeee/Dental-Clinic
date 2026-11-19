import "server-only";

import { ensureProfileRowExists, profileHasPinHash } from "@/lib/server/authProfilePin";
import { employeeRowToPayload, type AuthSessionPayload } from "@/lib/server/authSessionPayload";
import { ensureShadowAuthForRow } from "@/lib/server/ensureShadowAuth";
import { issueSupabaseSessionForUserId } from "@/lib/server/issueSupabaseSession";
import { isCompleteRuMobileDigits, normalizePhone, phoneDigitsSuffixPattern } from "@/lib/phone";
import { getSupabaseServiceRole } from "@/lib/supabase/serverAdmin";

import { verifyTelegramWebAppInitData } from "@/lib/server/telegramWebAppVerify";

export type EmployeeAuthRole = "admin" | "doctor";

export class EmployeePhoneLoginError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmployeePhoneLoginError";
    this.status = status;
  }
}

const ROLE_LABEL: Record<EmployeeAuthRole, string> = {
  admin: "Администратор",
  doctor: "Врач",
};

/** Поиск сотрудника по телефону, shadow Auth + JWT-сессия + PIN-флаг из profiles. */
export async function loginEmployeeByPhone(
  rawPhone: string,
  role: EmployeeAuthRole,
  initData: unknown,
): Promise<AuthSessionPayload> {
  const cleanPhone = normalizePhone(rawPhone);
  if (!isCompleteRuMobileDigits(cleanPhone)) {
    throw new EmployeePhoneLoginError("Некорректный номер.", 400);
  }

  const telegram = verifyTelegramWebAppInitData(
    typeof initData === "string" ? initData : undefined,
    process.env.TELEGRAM_BOT_TOKEN,
    300,
  );
  if (!telegram) throw new EmployeePhoneLoginError("Откройте приложение через Telegram.", 401);

  const pattern = phoneDigitsSuffixPattern(cleanPhone);
  const admin = getSupabaseServiceRole();

  const { data: emp, error } = await admin
    .from("dental_employees")
    .select("*")
    .ilike("phone", pattern)
    .eq("role", role)
    .eq("telegram_id", telegram.id)
    .maybeSingle();

  if (error) {
    throw new EmployeePhoneLoginError(error.message, 502);
  }
  if (!emp) {
    throw new EmployeePhoneLoginError(`${ROLE_LABEL[role]} не привязан к этому аккаунту Telegram.`, 404);
  }

  const authId = await ensureShadowAuthForRow("dental_employees", String(emp.id));
  await ensureProfileRowExists(authId);
  const tokens = await issueSupabaseSessionForUserId(authId);
  const hasPin = await profileHasPinHash(authId);

  return employeeRowToPayload(emp as Record<string, unknown>, tokens, hasPin);
}

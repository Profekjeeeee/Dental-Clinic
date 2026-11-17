import { NextResponse } from "next/server";

import { ensureProfileRowExists, profileHasPinHash } from "@/lib/server/authProfilePin";
import { clientRowToPayload, type AuthSessionPayload } from "@/lib/server/authSessionPayload";
import { ensureShadowAuthForRow } from "@/lib/server/ensureShadowAuth";
import { issueSupabaseSessionForUserId } from "@/lib/server/issueSupabaseSession";
import { isCompleteRuMobileDigits, normalizePhone, phoneDigitsSuffixPattern } from "@/lib/phone";
import { getSupabaseServiceRole } from "@/lib/supabase/serverAdmin";
import { isSupabaseConfigured } from "@/lib/supabase/publicConfig";

export const dynamic = "force-dynamic";

/** Временный вход пациента по телефону (без Telegram Mini App, только при DENTAL_GATE_DEV_ALLOW=1 в dev). */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase не настроен." }, { status: 503 });
  }

  const devBypass =
    process.env.NODE_ENV !== "production" && process.env.DENTAL_GATE_DEV_ALLOW?.trim() === "1";
  if (!devBypass) {
    return NextResponse.json(
      { ok: false, error: "Вход пациента без Telegram отключён." },
      { status: 403 },
    );
  }

  let body: { phone?: unknown };
  try {
    body = (await req.json()) as { phone?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON." }, { status: 400 });
  }

  const cleanPhone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  if (!isCompleteRuMobileDigits(cleanPhone)) {
    return NextResponse.json({ ok: false, error: "Некорректный номер телефона." }, { status: 400 });
  }

  try {
    const admin = getSupabaseServiceRole();
    const pattern = phoneDigitsSuffixPattern(cleanPhone);

    const { data: cli, error } = await admin
      .from("dental_clients")
      .select("*")
      .ilike("phone", pattern)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }
    if (!cli) {
      return NextResponse.json({ ok: true, needs_registration: true });
    }

    const authId = await ensureShadowAuthForRow("dental_clients", String(cli.id));
    await ensureProfileRowExists(authId);
    const tokens = await issueSupabaseSessionForUserId(authId);
    const hasPin = await profileHasPinHash(authId);
    const session: AuthSessionPayload = clientRowToPayload(
      cli as Record<string, unknown>,
      tokens,
      hasPin,
    );

    return NextResponse.json({ ok: true, session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

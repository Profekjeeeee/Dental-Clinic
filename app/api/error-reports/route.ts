import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/publicConfig";
import { getSupabaseServiceRole } from "@/lib/supabase/serverAdmin";

const EVENT_MESSAGE = /^(auth_telegram_failed|session_empty|session_initialized|chat_message_sent|(зубная формула|запись на приём|оплата|чат|файлы|авторизация|операция приложения): (ошибка соединения|ошибка базы данных|ошибка доступа|истекло время ожидания|ошибка операции)( \(HTTP \d{3}\))?)$/;

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer \S+$/i.test(authorization)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    const token = authorization.slice(7);
    const url = getSupabasePublicUrl();
    const key = getSupabasePublicAnonKey();
    if (!url || !key) return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
    const client = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: user, error: authError }, { data: clinicId, error: clinicError }] = await Promise.all([
      client.auth.getUser(token),
      client.rpc("user_clinic_id"),
    ]);
    if (authError || !user.user || clinicError || typeof clinicId !== "string") {
      return NextResponse.json({ error: "Не удалось определить клинику пользователя" }, { status: 403 });
    }

    const raw = await request.text();
    if (raw.length > 10000) return NextResponse.json({ error: "Отчёт слишком большой" }, { status: 413 });
    const body = JSON.parse(raw) as { details?: unknown; pathname?: unknown; events?: unknown };
    if (typeof body.details !== "string" || !EVENT_MESSAGE.test(body.details) ||
        typeof body.pathname !== "string" || !/^\/[a-zA-Z0-9_\-/\[\]]{0,150}$/.test(body.pathname) ||
        !Array.isArray(body.events) || body.events.length > 20 ||
        !body.events.every((event: unknown) => {
          if (!event || typeof event !== "object") return false;
          const item = event as Record<string, unknown>;
          return typeof item.message === "string" && EVENT_MESSAGE.test(item.message) &&
            typeof item.level === "string" && /^(INFO|WARN|ERROR)$/.test(item.level) &&
            typeof item.time === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.time);
        })) return NextResponse.json({ error: "Некорректный отчёт" }, { status: 400 });

    const admin = getSupabaseServiceRole();
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await admin.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("table_name", "error_reports").eq("actor_id", user.user.id).gte("created_at", since);
    if (countError) return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
    if ((count ?? 0) >= 3) return NextResponse.json({ error: "Слишком много отчётов. Попробуйте позже." }, { status: 429 });
    const { error } = await admin.from("audit_logs").insert({
      table_name: "error_reports",
      record_id: crypto.randomUUID(),
      action: "insert",
      actor_id: user.user.id,
      clinic_id: clinicId,
      new_data: { details: body.details, pathname: body.pathname, events: body.events },
    });
    if (error) return NextResponse.json({ error: "Не удалось сохранить отчёт" }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Не удалось отправить отчёт" }, { status: 500 });
  }
}

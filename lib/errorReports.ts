"use client";

import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserId } from "@/lib/auth";

type DiagnosticEvent = { time: string; level: string; message: string };
const recentEvents: DiagnosticEvent[] = [];
let lastUserId: string | null | undefined;

function syncSession(): void {
  const userId = getCurrentUserId();
  if (lastUserId !== undefined && lastUserId !== userId) recentEvents.length = 0;
  lastUserId = userId;
}

/** Record error categories without copying patient data or arbitrary server responses. */
function describeEvent(value: string): string {
  if (/^(auth_telegram_failed|session_empty|session_initialized|chat_message_sent)$/.test(value)) return value;
  const areas: Array<[RegExp, string]> = [
    [/формул|зуб/i, "зубная формула"],
    [/запис|приём|прием|слот/i, "запись на приём"],
    [/счёт|счет|оплат/i, "оплата"],
    [/чат|сообщен/i, "чат"],
    [/файл|документ/i, "файлы"],
    [/авторизац|аккаунт|войти/i, "авторизация"],
  ];
  const causes: Array<[RegExp, string]> = [
    [/failed to fetch|network|сеть|соединен/i, "ошибка соединения"],
    [/supabase|schema|колонк|миграци/i, "ошибка базы данных"],
    [/unauthorized|forbidden|доступ|permission/i, "ошибка доступа"],
    [/timeout|timed out/i, "истекло время ожидания"],
  ];
  const area = areas.find(([pattern]) => pattern.test(value))?.[1] ?? "операция приложения";
  const cause = causes.find(([pattern]) => pattern.test(value))?.[1] ?? "ошибка операции";
  const status = value.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  return `${area}: ${cause}${status ? ` (HTTP ${status})` : ""}`;
}

export function rememberDiagnostic(level: string, message: string): void {
  syncSession();
  recentEvents.push({ time: new Date().toISOString(), level, message: describeEvent(message) });
  if (recentEvents.length > 20) recentEvents.shift();
}

export async function sendErrorReport(message: string): Promise<void> {
  syncSession();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Для отправки отчёта войдите в приложение.");
  const pathname = window.location.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\/\d+(?=\/|$)/g, "/[id]");
  const response = await fetch("/api/error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ details: describeEvent(message), pathname, events: [...recentEvents] }),
  });
  if (!response.ok) throw new Error("Не удалось отправить отчёт. Проверьте соединение и попробуйте снова.");
}

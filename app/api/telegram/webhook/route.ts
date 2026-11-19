import { NextResponse } from "next/server";

import { withCancellationMarker } from "@/lib/appointmentCancellation";
import {
  escapeHtmlTg,
  formatDateRuFromIso,
  notifyDoctorPatientCancelled,
  notifyDoctorPatientConfirmed,
} from "@/lib/server/appointmentTelegram";
import { getSupabaseServiceRole } from "@/lib/supabase/serverAdmin";
import {
  answerCallbackQuery,
  appOpenKeyboard,
  editTelegramMessage,
  sendTelegramMessage,
} from "@/lib/server/telegramBot";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
  if (headerSecret && headerSecret === expected) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === expected;
}

interface TgCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

interface TgUpdate {
  callback_query?: TgCallbackQuery;
}

function parseCallbackData(
  data: string,
): { action: "confirm" | "cancel"; appointmentId: string } | null {
  const m = /^apt:(confirm|cancel):([a-zA-Z0-9_-]+)$/.exec(data.trim());
  if (!m) return null;
  return { action: m[1] as "confirm" | "cancel", appointmentId: m[2]! };
}

async function safeAnswerCallback(params: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  try {
    await answerCallbackQuery(params);
  } catch (e) {
    console.warn("[telegram/webhook] answerCallbackQuery failed:", e);
  }
}

async function safeEditMessage(params: {
  chatId: string | number;
  messageId: number;
  text: string;
  replyMarkup?: ReturnType<typeof appOpenKeyboard>;
}) {
  try {
    await editTelegramMessage(params);
    return true;
  } catch (e) {
    console.warn("[telegram/webhook] editTelegramMessage failed:", e);
    return false;
  }
}

async function safeSendMessage(params: {
  chatId: string | number;
  text: string;
  replyMarkup?: ReturnType<typeof appOpenKeyboard>;
}) {
  try {
    await sendTelegramMessage(params);
  } catch (e) {
    console.warn("[telegram/webhook] sendTelegramMessage failed:", e);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "telegram_webhook" });
}

/**
 * Telegram Bot webhook — inline-кнопки подтверждения/отмены записи.
 * Настройка: setWebhook → https://<domain>/api/telegram/webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
 */
export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    console.warn("[telegram/webhook] 403 secret mismatch");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq?.data) {
    return NextResponse.json({ ok: true });
  }

  const replyChatId = cq.message?.chat.id ?? cq.from.id;
  const parsed = parseCallbackData(cq.data);
  if (!parsed) {
    await safeAnswerCallback({ callbackQueryId: cq.id, text: "Неизвестная команда" });
    return NextResponse.json({ ok: true });
  }

  const sb = getSupabaseServiceRole();
  const { data: apt, error: fetchError } = await sb
    .from("appointments")
    .select("*")
    .eq("id", parsed.appointmentId)
    .maybeSingle();

  if (fetchError) {
    console.error("[telegram/webhook] fetch appointment failed:", fetchError);
    await safeAnswerCallback({
      callbackQueryId: cq.id,
      text: "Ошибка при загрузке записи",
      showAlert: true,
    });
    return NextResponse.json({ ok: true });
  }

  if (!apt) {
    await safeAnswerCallback({
      callbackQueryId: cq.id,
      text: "Запись не найдена",
      showAlert: true,
    });
    await safeSendMessage({
      chatId: replyChatId,
      text: "⚠️ Не удалось найти эту запись. Проверьте список записей в приложении.",
      replyMarkup: appOpenKeyboard(),
    });
    return NextResponse.json({ ok: true });
  }

  const { data: patient, error: patientError } = await sb
    .from("dental_clients")
    .select("telegram_id")
    .eq("id", apt.client_id)
    .eq("clinic_id", apt.clinic_id)
    .maybeSingle();
  if (patientError) return NextResponse.json({ error: "Ошибка проверки записи." }, { status: 503 });
  if (!patient?.telegram_id || String(patient.telegram_id) !== String(cq.from.id) ||
      !apt.confirmation_tg_message_id || String(apt.confirmation_tg_message_id) !== String(cq.message?.message_id)) {
    await safeAnswerCallback({ callbackQueryId: cq.id, text: "Кнопка больше недоступна.", showAlert: true });
    return NextResponse.json({ ok: true });
  }

  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const doctorName = escapeHtmlTg(String(apt.doctor_name ?? "врача"));
  const dateRu = escapeHtmlTg(formatDateRuFromIso(String(apt.appointment_date)));
  const timeRu = escapeHtmlTg(String(apt.appointment_time));

  if (parsed.action === "confirm") {
    if (apt.status === "cancelled") {
      if (chatId != null && messageId != null) {
        await safeEditMessage({
          chatId,
          messageId,
          text:
            `<b>❌ Запись отменена</b>\n` +
            `Приём у врача ${doctorName}\n` +
            `Дата: ${dateRu}\n` +
            `Время: ${timeRu}`,
          replyMarkup: appOpenKeyboard(),
        });
      }
      await safeAnswerCallback({
        callbackQueryId: cq.id,
        text: "Запись уже была отменена",
        showAlert: true,
      });
      await safeSendMessage({
        chatId: replyChatId,
        text:
          `<b>⚠️ Запись уже отменена</b>\n` +
          `Приём у врача ${doctorName} (${dateRu}, ${timeRu}) был отменён ранее.`,
        replyMarkup: appOpenKeyboard(),
      });
      return NextResponse.json({ ok: true });
    }

    const alreadyConfirmed = Boolean(apt.confirmed_at);
    const { error: updError } = await sb
      .from("appointments")
      .update({
        confirmed_at: apt.confirmed_at || new Date().toISOString(),
        status: apt.status === "pending" ? "scheduled" : apt.status,
      })
      .eq("id", parsed.appointmentId);

    if (updError) {
      console.error("[telegram/webhook] confirm update failed:", updError);
      await safeAnswerCallback({
        callbackQueryId: cq.id,
        text: "Не удалось подтвердить запись",
        showAlert: true,
      });
      return NextResponse.json({ ok: true });
    }

    await safeAnswerCallback({
      callbackQueryId: cq.id,
      text: alreadyConfirmed ? "Запись уже подтверждена" : "✅ Запись успешно подтверждена",
    });

    const cardText =
      `<b>✅ Запись успешно подтверждена</b>\n` +
      `Врач: ${doctorName}\n` +
      `Дата: ${dateRu}\n` +
      `Время: ${timeRu}\n\n` +
      `До встречи в клинике!`;

    const edited = chatId != null && messageId != null && await safeEditMessage({
      chatId,
      messageId,
      text: cardText,
      replyMarkup: appOpenKeyboard(),
    });
    if (!edited) {
      await safeSendMessage({ chatId: replyChatId, text: cardText, replyMarkup: appOpenKeyboard() });
    }

    if (!alreadyConfirmed) {
      try {
        await notifyDoctorPatientConfirmed(parsed.appointmentId);
      } catch (e) {
        console.warn("[telegram/webhook] notifyDoctorPatientConfirmed failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // parsed.action === "cancel"
  if (apt.status === "cancelled") {
    if (chatId != null && messageId != null) {
      await safeEditMessage({
        chatId,
        messageId,
        text:
          `<b>❌ Запись отменена</b>\n` +
          `Приём у врача ${doctorName}\n` +
          `Дата: ${dateRu}\n` +
          `Время: ${timeRu}`,
        replyMarkup: appOpenKeyboard(),
      });
    }
    await safeAnswerCallback({ callbackQueryId: cq.id, text: "Запись уже отменена" });
    await safeSendMessage({
      chatId: replyChatId,
      text: `<b>❌ Запись уже отменена</b>\nПриём у врача ${doctorName} (${dateRu}, ${timeRu}).`,
      replyMarkup: appOpenKeyboard(),
    });
    return NextResponse.json({ ok: true });
  }

  const markedComment = withCancellationMarker(apt.comment, "client");
  let { error: cancelErr } = await sb
    .from("appointments")
    .update({ status: "cancelled", comment: markedComment })
    .eq("id", parsed.appointmentId);

  if (cancelErr) {
    ({ error: cancelErr } = await sb
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", parsed.appointmentId));
  }

  if (cancelErr) {
    console.error("[telegram/webhook] cancel update failed:", cancelErr);
    await safeAnswerCallback({
      callbackQueryId: cq.id,
      text: "Не удалось отменить запись",
      showAlert: true,
    });
    return NextResponse.json({ ok: true });
  }

  await safeAnswerCallback({
    callbackQueryId: cq.id,
    text: "❌ Запись отменена",
  });

  // Отзываем неоплаченный счёт, привязанный к отменённой записи
  try {
    await sb
      .from("bills")
      .delete()
      .eq("appointment_id", apt.id)
      .in("status", ["pending", "overdue"]);
  } catch (e) {
    console.warn("[telegram/webhook] revoke bill failed:", e);
  }

  try {
    await notifyDoctorPatientCancelled(parsed.appointmentId);
  } catch (e) {
    console.warn("[telegram/webhook] notifyDoctorPatientCancelled failed:", e);
  }

  const cancelledText =
    `<b>❌ Запись отменена</b>\n` +
    `Приём у врача ${doctorName}\n` +
    `Дата: ${dateRu}\n` +
    `Время: ${timeRu}\n\n` +
    `Время освобождено. Чтобы записаться снова — откройте приложение.`;

  if (chatId != null && messageId != null) {
    await safeEditMessage({
      chatId,
      messageId,
      text: cancelledText,
      replyMarkup: appOpenKeyboard(),
    });
  }

  await safeSendMessage({
    chatId: replyChatId,
    text: cancelledText,
    replyMarkup: appOpenKeyboard(),
  });

  return NextResponse.json({ ok: true });
}

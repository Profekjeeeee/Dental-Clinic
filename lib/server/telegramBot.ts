import "server-only";

export type TgInlineKeyboard = {
  inline_keyboard: Array<Array<Record<string, unknown>>>;
};

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export function getMiniAppUrl(): string | null {
  const candidates = [
    process.env.TELEGRAM_MINI_APP_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.APP_URL?.trim(),
    process.env.VERCEL_URL?.trim(),
  ];
  for (const raw of candidates) {
    if (!raw || raw === "MY_APP_URL") continue;
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "https:") continue;
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") continue;
      return normalized.replace(/\/$/, "");
    } catch {
      continue;
    }
  }
  return null;
}

async function tgApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !json?.ok) {
    const detail = json?.description ?? `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }
  return json.result as T;
}

export function appOpenKeyboard(): TgInlineKeyboard {
  const url = getMiniAppUrl();
  if (!url) return { inline_keyboard: [] };
  return {
    inline_keyboard: [[{ text: "Открыть приложение", web_app: { url } }]],
  };
}

/** Кнопки возврата пациента: запись + Mini App. */
export function reactivationKeyboard(): TgInlineKeyboard {
  const base = getMiniAppUrl();
  const bookingUrl = base ? `${base.replace(/\/$/, "")}/booking` : null;
  const rows: Array<Array<Record<string, unknown>>> = [];
  if (bookingUrl) {
    rows.push([{ text: "📅 Записаться на приём", web_app: { url: bookingUrl } }]);
  }
  const appRow = appOpenKeyboard().inline_keyboard[0];
  if (appRow) rows.push(appRow);
  return { inline_keyboard: rows };
}

export function appointmentConfirmKeyboard(appointmentId: string): TgInlineKeyboard {
  const rows: Array<Array<Record<string, unknown>>> = [
    [
      { text: "✅ Подтверждаю", callback_data: `apt:confirm:${appointmentId}` },
      { text: "❌ Отменить", callback_data: `apt:cancel:${appointmentId}` },
    ],
  ];
  const appRow = appOpenKeyboard().inline_keyboard[0];
  if (appRow) rows.push(appRow);
  return { inline_keyboard: rows };
}

export async function sendTelegramMessage(params: {
  chatId: string | number;
  text: string;
  replyMarkup?: TgInlineKeyboard;
}): Promise<{ messageId: number }> {
  const payload: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: "HTML",
  };
  if (params.replyMarkup && params.replyMarkup.inline_keyboard.length > 0) {
    payload.reply_markup = params.replyMarkup;
  }
  const result = await tgApi<{ message_id: number }>("sendMessage", payload);
  return { messageId: result.message_id };
}

export async function editTelegramMessage(params: {
  chatId: string | number;
  messageId: number;
  text: string;
  replyMarkup?: TgInlineKeyboard;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: params.chatId,
    message_id: params.messageId,
    text: params.text,
    parse_mode: "HTML",
  };
  if (params.replyMarkup && params.replyMarkup.inline_keyboard.length > 0) {
    payload.reply_markup = params.replyMarkup;
  } else {
    payload.reply_markup = { inline_keyboard: [] };
  }
  await tgApi("editMessageText", payload);
}

export async function answerCallbackQuery(params: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}): Promise<void> {
  await tgApi("answerCallbackQuery", {
    callback_query_id: params.callbackQueryId,
    text: params.text,
    show_alert: params.showAlert ?? false,
  });
}

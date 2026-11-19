"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdminPayments } from "@/lib/admin/finance";
import { AUDIT_ACTION_LABELS, AUDIT_TABLE_LABELS, fetchAuditLogs } from "@/lib/auditLogs";
import ThemeToggleButton from "@/components/ui/ThemeToggleButton";

type FeedEvent = {
  id: string;
  date: string;
  label: string;
  href: string;
};

export default function AdminFeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void Promise.allSettled([fetchAuditLogs({ limit: 50 }), fetchAdminPayments()]).then(([audit, payments]) => {
      if (!active) return;
      const changes = audit.status === "fulfilled" ? audit.value.data : [];
      const transactions = payments.status === "fulfilled" ? payments.value.data : [];
      const history = [
        ...changes.map((entry) => ({
          id: `audit-${entry.id}`,
          date: entry.createdAt,
          label: `${AUDIT_ACTION_LABELS[entry.action]} · ${AUDIT_TABLE_LABELS[entry.tableName] ?? "Журнал изменений"}`,
          href: "/screens/admin/audit",
        })),
        ...transactions.filter((payment) => Boolean(payment.completedAt)).map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.completedAt ?? payment.createdAt,
          label: `Платёж по счёту №${payment.billNumber} · ${payment.amount.toLocaleString("ru-RU")} ₽`,
          href: "/screens/admin/finance",
        })),
      ];
      setEvents(history.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 50));
      setError(audit.status === "rejected" || Boolean(audit.value.error) ||
        payments.status === "rejected" || Boolean(payments.value.error));
      setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <main className="min-h-dvh px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-safe">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Лента событий</h1>
        <ThemeToggleButton sizeClass="w-9 h-9" />
      </header>
      <p className="mb-4 text-sm text-secondary">Изменения медданных и платежи</p>
      {loading && <p role="status" className="text-sm text-secondary">Загружаем события…</p>}
      {error && (
        <div role="alert" className="mb-3 text-sm">
          Часть событий не удалось загрузить.
          <button type="button" className="block min-h-11 text-primary" onClick={() => setAttempt(attempt + 1)}>Повторить</button>
        </div>
      )}
      {!loading && !error && events.length === 0 && <p className="text-sm text-secondary">Событий пока нет</p>}
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={event.href} className="block rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="break-words font-medium">{event.label}</p>
              <time dateTime={event.date} className="text-sm text-secondary">
                {new Date(event.date).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

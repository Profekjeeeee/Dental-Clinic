"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ReceiptText,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import BottomBar from "@/components/layout/BottomBar";
import {
  initBills,
  getBills,
  hasBillsCache,
  getTotalPending,
  formatBillDate,
  refreshBillsCache,
} from "@/lib/bills";
import {
  getCachedPatientPayments,
  getPatientPayments,
  refreshPatientPayments,
  hasPaymentsCache,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/payments";
import type { Bill, Payment } from "@/types";

type BillsTab = "pending" | "history";

function isPendingBill(bill: Bill): boolean {
  return bill.status === "pending" || bill.status === "overdue" || bill.status === "partial";
}

function pluralizeBillDative(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "счёту";
  return "счетам";
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BillsTab>("pending");

  useLayoutEffect(() => {
    if (hasBillsCache()) {
      setBills(getBills());
      setLoading(false);
    }
    if (hasPaymentsCache()) {
      setPayments(getCachedPatientPayments());
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setBills(await initBills());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    void getPatientPayments().then(setPayments);

    const syncFresh = async () => {
      await Promise.all([
        refreshBillsCache(),
        refreshPatientPayments(),
      ]);
      setBills(getBills());
      setPayments(getCachedPatientPayments());
    };
    const onBillsUpdated = () => setBills(getBills());
    const onPaymentsUpdated = () => setPayments(getCachedPatientPayments());
    const onFocus = () => void syncFresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void syncFresh();
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void syncFresh();
    }, 15000);

    window.addEventListener("billsUpdated", onBillsUpdated);
    window.addEventListener("paymentsUpdated", onPaymentsUpdated);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(poll);
      window.removeEventListener("billsUpdated", onBillsUpdated);
      window.removeEventListener("paymentsUpdated", onPaymentsUpdated);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadData]);

  const pendingBills = bills.filter(isPendingBill);
  const paidBills = bills.filter((b) => b.status === "paid");
  const totalPending = getTotalPending(bills);
  const historyCount = paidBills.length + payments.length;

  return (
    <div className="min-h-dvh bg-surface dark:bg-app-canvas pb-safe">
      <Header title="Мои счета" />

      {/* ── Баланс к оплате ─────────────────────────────────── */}
      <div className="px-5 pt-4 max-w-[480px] mx-auto">
        <div
          className="rounded-[20px] px-5 pt-5 pb-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, #0D2347 0%, #1A3A6B 60%, #1E4580 100%)",
          }}
        >
          <div
            className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(circle, #3ECFFF 0%, transparent 70%)" }}
          />
          <div
            className="absolute -left-4 -bottom-6 w-32 h-32 rounded-full opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(circle, #3ECFFF 0%, transparent 70%)" }}
          />

          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300/75 mb-1.5">
            Текущий баланс к оплате
          </p>

          <p className="text-[36px] font-bold text-white leading-none mb-1 tabular-nums">
            {totalPending > 0
              ? `${totalPending.toLocaleString("ru-RU")} ₽`
              : "0 ₽"}
          </p>

          {totalPending > 0 ? (
            <>
              <p className="text-[12px] text-blue-200/75 mb-4 tabular-nums">
                По {pendingBills.length} {pluralizeBillDative(pendingBills.length)}
              </p>
              <p className="text-sm text-blue-100">Онлайн-оплата временно недоступна</p>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-5 h-5 rounded-full bg-sky-400/15 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-[#3ECFFF]" />
              </div>
              <p className="text-[13px] text-blue-100 font-medium">Нет задолженностей</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Переключатель вкладок (Ожидают / История) ────────── */}
      <div className="px-5 pt-4 max-w-[480px] mx-auto">
        <div
          role="tablist"
          aria-label="Фильтр счетов"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-[12px] bg-slate-200/70 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
            className={`min-h-[40px] px-3 rounded-[9px] text-[13px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "pending"
                ? "bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white"
            }`}
          >
            <span>Ожидают</span>
            <span
              className={`tabular-nums text-[12px] ${
                activeTab === "pending"
                  ? "text-primary font-bold"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {pendingBills.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            className={`min-h-[40px] px-3 rounded-[9px] text-[13px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "history"
                ? "bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white"
            }`}
          >
            <span>История</span>
            <span
              className={`tabular-nums text-[12px] ${
                activeTab === "history"
                  ? "text-primary font-bold"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {historyCount}
            </span>
          </button>
        </div>
      </div>

      {/* ── Содержимое выбранной вкладки ────────────────────── */}
      <main className="px-5 pt-4 flex flex-col gap-4 max-w-[480px] mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="h-28 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
            <div className="h-28 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
          </div>
        ) : activeTab === "pending" ? (
          pendingBills.length > 0 ? (
            <section className="flex flex-col gap-3">
              {pendingBills.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                />
              ))}
            </section>
          ) : (
            <Card className="py-10 text-center">
              <div className="w-11 h-11 rounded-full bg-primary-light dark:bg-primary/15 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
                Нет счетов к оплате
              </p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                Все начисленные счета уже оплачены
              </p>
            </Card>
          )
        ) : (
          <>
            {paidBills.length > 0 && (
              <section>
                <p className="text-[12px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 px-0.5">
                  Оплаченные счета
                </p>
                <div className="flex flex-col gap-3">
                  {paidBills.map((bill) => (
                    <BillCard key={bill.id} bill={bill} />
                  ))}
                </div>
              </section>
            )}

            {payments.length > 0 && (
              <section>
                <p className="text-[12px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 px-0.5">
                  История оплат
                </p>
                <div className="flex flex-col gap-3">
                  {payments.map((payment) => (
                    <PaymentCard key={payment.id} payment={payment} />
                  ))}
                </div>
              </section>
            )}

            {paidBills.length === 0 && payments.length === 0 && (
              <Card className="py-10 text-center">
                <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <ReceiptText className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white">
                  История оплат пока пуста
                </p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                  Оплаченные счета и чеки появятся здесь
                </p>
              </Card>
            )}
          </>
        )}

        {/* Карточка налогового вычета отображается в обеих вкладках */}
      </main>

      <BottomBar />
    </div>
  );
}

// ── PaymentCard ─────────────────────────────────────────────────────────────

function PaymentCard({ payment }: { payment: Payment }) {
  const isSuccess = payment.status === "succeeded";
  const dateStr = payment.completedAt ?? payment.createdAt;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white tabular-nums">
            {payment.amount.toLocaleString("ru-RU")} ₽
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {PAYMENT_METHOD_LABELS[payment.method]} · {formatBillDate(dateStr)}
          </p>
        </div>
        <span
          className={`text-[12px] font-semibold shrink-0 ${
            isSuccess ? "text-primary" : "text-slate-400"
          }`}
        >
          {PAYMENT_STATUS_LABELS[payment.status]}
        </span>
      </div>
    </Card>
  );
}

// ── BillCard ────────────────────────────────────────────────────────────────

function BillCard({
  bill,
}: {
  bill: Bill;
}) {
  const isPending = isPendingBill(bill);
  const isOverdue = bill.status === "overdue";
  const isPartial = bill.status === "partial";
  const primaryService = bill.items[0]?.service ?? "Медицинская услуга";
  const amountDue = isPartial
    ? Math.max(0, bill.totalAmount - bill.paidAmount)
    : bill.totalAmount;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#0F172A] dark:text-white leading-tight">
            {primaryService}
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {bill.number} · {formatBillDate(bill.issuedAt)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {isPending ? (
            <>
              {isOverdue ? (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span
                className={`text-[12px] font-semibold ${
                  isOverdue ? "text-red-500" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {isOverdue ? "Просрочен" : isPartial ? "Частично" : "Ожидает"}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[12px] font-semibold text-primary">
                Оплачено
              </span>
            </>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-800 mb-3" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[24px] font-bold text-[#0F172A] dark:text-white tabular-nums leading-tight">
            {amountDue.toLocaleString("ru-RU")} ₽
          </p>
          {isPartial && bill.paidAmount > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              Оплачено {bill.paidAmount.toLocaleString("ru-RU")} из {bill.totalAmount.toLocaleString("ru-RU")} ₽
            </p>
          )}
        </div>


        {!isPending && bill.paidAt && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBillDate(bill.paidAt)}
          </p>
        )}
      </div>
    </Card>
  );
}

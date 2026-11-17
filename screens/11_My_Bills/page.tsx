"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Mail,
  ReceiptText,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import BottomBar from "@/components/layout/BottomBar";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import {
  initBills,
  getBills,
  hasBillsCache,
  payBillById,
  getTotalPending,
  formatBillDate,
  refreshBillsCache,
} from "@/lib/bills";
import {
  getCachedPatientPayments,
  getPatientPayments,
  hasPaymentsCache,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/payments";
import { getProfile, saveProfile } from "@/lib/userProfile";
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
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const { toastMessage, toastVisible, toastTone, showToast } = useToast();

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
      const [loadedBills, loadedPayments] = await Promise.all([
        initBills(),
        getPatientPayments(),
      ]);
      setBills(loadedBills);
      setPayments(loadedPayments);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const syncFresh = async () => {
      await Promise.all([
        refreshBillsCache(true),
        getPatientPayments({ force: true }),
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

  const refreshAfterPayment = useCallback(async () => {
    setBills(getBills());
    const updatedPayments = await getPatientPayments({ force: true });
    setPayments(updatedPayments);
  }, []);

  const handlePayOne = async (id: string) => {
    setPayingId(id);
    try {
      await payBillById(id);
      await refreshAfterPayment();
      showToast("Счёт успешно оплачен");
    } catch (e: unknown) {
      console.error("[bills] pay", e);
      const msg = e instanceof Error ? e.message : "Не удалось выполнить оплату";
      showToast(msg, "error");
    } finally {
      setPayingId(null);
    }
  };

  const handlePayAll = async () => {
    if (totalPending === 0) return;
    setPayingAll(true);
    try {
      for (const bill of pendingBills) {
        await payBillById(bill.id);
      }
      await refreshAfterPayment();
      showToast("Все счета оплачены");
    } catch (e: unknown) {
      console.error("[bills] payAll", e);
      const msg = e instanceof Error ? e.message : "Не удалось выполнить оплату";
      showToast(msg, "error");
    } finally {
      setPayingAll(false);
    }
  };

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
              <button
                type="button"
                onClick={handlePayAll}
                disabled={payingAll}
                className="interactive-press-sm w-full min-h-[44px] h-11 rounded-[10px] text-[14px] font-bold text-[#0D2347] shadow-[0_4px_14px_rgba(62,207,255,0.45)] border border-sky-300/40 dark:shadow-[0_6px_20px_rgba(0,0,0,0.35)] dark:border-sky-400/20 disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
                style={{ background: "#3ECFFF" }}
              >
                {payingAll ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    Оплата...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-[#0D2347]" />
                    Оплатить онлайн
                  </>
                )}
              </button>
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
                  onPay={handlePayOne}
                  paying={payingId === bill.id}
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
        <TaxDeductionCard />
      </main>

      <BottomBar />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        tone={toastTone}
        variant="patientWithTabBar"
      />
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
  onPay,
  paying,
}: {
  bill: Bill;
  onPay?: (id: string) => void;
  paying?: boolean;
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

        {isPending && onPay && (
          <button
            type="button"
            onClick={() => onPay(bill.id)}
            disabled={paying}
            className="interactive-press-sm min-h-[40px] px-4 rounded-[8px] bg-primary text-white text-[13px] font-semibold shadow-[0_4px_12px_rgba(36,139,207,0.35)] dark:shadow-none border border-primary-dark/25 disabled:opacity-60 disabled:active:scale-100 flex items-center gap-1.5 whitespace-nowrap"
          >
            {paying && <Loader2 className="animate-spin h-3.5 w-3.5" />}
            {paying ? "Оплата..." : "Оплатить"}
          </button>
        )}

        {!isPending && bill.paidAt && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBillDate(bill.paidAt)}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── TaxDeductionCard ────────────────────────────────────────────────────────

type TaxModalView = "confirm" | "enter_email" | "success";

function TaxDeductionCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [view, setView] = useState<TaxModalView>("confirm");
  const [userEmail, setUserEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);

  const openModal = () => {
    const email = getProfile().email.trim();
    setUserEmail(email);
    setView(email ? "confirm" : "enter_email");
    setEmailInput("");
    setEmailError("");
    setSending(false);
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const id = requestAnimationFrame(() => setModalVisible(true));
    return () => cancelAnimationFrame(id);
  }, [modalOpen]);

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 300);
  };

  const handleSend = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    setSending(false);
    setView("success");
    setTimeout(() => closeModal(), 2200);
  };

  const handleSubmitEmail = async () => {
    const trimmed = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Введите корректный email-адрес");
      return;
    }
    setSending(true);
    const profile = getProfile();
    saveProfile({ ...profile, email: trimmed });
    await new Promise((r) => setTimeout(r, 800));
    setSending(false);
    setUserEmail(trimmed);
    setView("success");
    setTimeout(() => closeModal(), 2200);
  };

  return (
    <>
      <Card radius="lg" className="!p-0 overflow-hidden mt-1">
        {/* Иллюстрация */}
        <div
          className="w-full h-[130px] relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #e8f4fc 0%, #bfdbfe 100%)" }}
        >
          <svg
            viewBox="0 0 360 130"
            fill="none"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid slice"
          >
            <rect x="0" y="0" width="360" height="102" fill="#dbeafe" />
            <rect x="0" y="102" width="360" height="28" fill="#93c5fd" />
            <line x1="0" y1="102" x2="360" y2="102" stroke="#60a5fa" strokeWidth="1.5" />
            <rect x="18" y="14" width="56" height="52" rx="3" fill="#7dd3fc" />
            <rect x="18" y="14" width="56" height="52" rx="3" stroke="#3b82f6" strokeWidth="1.5" />
            <line x1="46" y1="14" x2="46" y2="66" stroke="#3b82f6" strokeWidth="1" />
            <line x1="18" y1="40" x2="74" y2="40" stroke="#3b82f6" strokeWidth="1" />
            <rect x="22" y="18" width="10" height="18" rx="2" fill="white" opacity="0.3" />
            <rect x="98" y="22" width="18" height="5" rx="2.5" fill="currentColor" opacity="0.3" />
            <rect x="104" y="16" width="5" height="18" rx="2.5" fill="currentColor" opacity="0.3" />
            <rect x="145" y="90" width="80" height="12" rx="4" fill="#93c5fd" />
            <rect x="140" y="64" width="90" height="32" rx="10" fill="#FFFFFF" />
            <rect x="140" y="64" width="90" height="32" rx="10" stroke="#93c5fd" strokeWidth="1.5" />
            <rect x="188" y="44" width="34" height="26" rx="8" fill="#FFFFFF" />
            <rect x="188" y="44" width="34" height="26" rx="8" stroke="#93c5fd" strokeWidth="1.5" />
            <rect x="203" y="62" width="5" height="26" rx="2.5" fill="#93c5fd" />
            <rect x="245" y="18" width="5" height="84" rx="2.5" fill="#7dd3fc" />
            <rect x="228" y="18" width="22" height="4" rx="2" fill="#7dd3fc" />
            <ellipse cx="224" cy="20" rx="10" ry="9" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5" />
            <ellipse cx="224" cy="20" rx="5" ry="4.5" fill="#FDE68A" opacity="0.7" />
            <rect x="246" y="52" width="30" height="5" rx="2.5" fill="#7dd3fc" />
            <rect x="244" y="56" width="34" height="8" rx="3" fill="#dbeafe" stroke="#7dd3fc" strokeWidth="1" />
            <rect x="298" y="80" width="26" height="22" rx="4" fill="#60a5fa" />
            <rect x="301" y="78" width="20" height="4" rx="2" fill="#3b82f6" />
            <ellipse cx="311" cy="60" rx="16" ry="22" fill="#2563eb" />
            <ellipse cx="296" cy="56" rx="12" ry="16" fill="#1d4ed8" />
            <ellipse cx="326" cy="58" rx="11" ry="15" fill="#1d4ed8" />
            <rect x="309" y="68" width="4" height="14" rx="2" fill="#1e40af" />
            <rect x="280" y="38" width="18" height="60" rx="3" fill="#dbeafe" stroke="#7dd3fc" strokeWidth="1" />
            <circle cx="285" cy="68" r="2" fill="#7dd3fc" />
          </svg>
        </div>

        {/* Контент */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-primary" />
            </div>
            <p className="text-[15px] font-bold text-[#0F172A] dark:text-white">Налоговый вычет</p>
          </div>

          <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
            Мы подготовим все необходимые документы для получения налогового вычета{" "}
            <span className="font-bold text-primary">13%</span> за ваше лечение.
          </p>

          <button
            type="button"
            onClick={openModal}
            className="flex items-center gap-1.5 min-h-[40px] text-[13px] font-semibold text-primary active:opacity-70 active:scale-95 transition-all"
          >
            Заказать справку
            <ArrowRight className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
      </Card>

      {/* ── Модальное окно заказа справки ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tax-cert-modal-title"
        >
          <button
            type="button"
            className={`fixed inset-0 cursor-default border-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out outline-none ${
              modalVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={closeModal}
            aria-label="Закрыть"
          />
          <div
            className={`fixed bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+5.25rem))] left-1/2 z-[1] w-[calc(100%-32px)] max-w-md origin-bottom -translate-x-1/2 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out dark:border-slate-600 dark:bg-[#1E293B] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] max-h-[min(78vh,calc(100dvh-6rem-env(safe-area-inset-bottom,0px)))] overflow-y-auto ${
              modalVisible ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {view === "confirm" && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p
                      id="tax-cert-modal-title"
                      className="text-[16px] font-bold text-[#0F172A] dark:text-white"
                    >
                      Заказать справку
                    </p>
                    <p className="text-[12px] text-slate-400">для налогового вычета 13%</p>
                  </div>
                </div>

                <div className="rounded-[12px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 mb-4 shadow-raised-surface">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Отправим на почту
                  </p>
                  <p className="text-[14px] font-semibold text-[#0F172A] dark:text-white truncate">
                    {userEmail}
                  </p>
                </div>

                <p className="text-[12px] text-slate-400 leading-relaxed mb-5">
                  Справка об оплаченных медицинских услугах будет сформирована и отправлена на указанный адрес в течение одного рабочего дня.
                </p>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="interactive-press-sm flex-1 h-11 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-500 dark:text-slate-400 shadow-raised-surface"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="interactive-press-sm flex-1 h-11 rounded-[10px] bg-primary text-white text-[14px] font-semibold shadow-[0_4px_12px_rgba(36,139,207,0.35)] dark:shadow-none border border-primary-dark/25 disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4" />
                        Отправка...
                      </>
                    ) : (
                      "Отправить"
                    )}
                  </button>
                </div>
              </>
            )}

            {view === "enter_email" && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p id="tax-cert-modal-title" className="text-[16px] font-bold text-[#0F172A] dark:text-white">
                      Укажите email
                    </p>
                    <p className="text-[12px] text-slate-400">для получения справки</p>
                  </div>
                </div>

                <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                  В вашем профиле не указана электронная почта. Введите адрес — справка будет отправлена на него, а адрес сохранится в профиле.
                </p>

                <div className="mb-1">
                  <input
                    type="email"
                    placeholder="example@mail.ru"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailError("");
                    }}
                    className={`w-full h-11 rounded-[10px] border px-4 text-[14px] outline-none transition-colors bg-white dark:bg-slate-800 dark:text-white ${
                      emailError
                        ? "border-red-400 focus:border-red-400"
                        : "border-slate-200 dark:border-slate-600 focus:border-primary"
                    }`}
                  />
                  {emailError && (
                    <p className="text-[12px] text-red-500 mt-1 px-1">{emailError}</p>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mb-5 px-1">
                  Адрес будет сохранён в вашем профиле
                </p>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="interactive-press-sm flex-1 h-11 rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-500 dark:text-slate-400 shadow-raised-surface"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitEmail}
                    disabled={sending}
                    className="interactive-press-sm flex-1 h-11 rounded-[10px] bg-primary text-white text-[14px] font-semibold shadow-[0_4px_12px_rgba(36,139,207,0.35)] dark:shadow-none border border-primary-dark/25 disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4" />
                        Отправка...
                      </>
                    ) : (
                      "Отправить"
                    )}
                  </button>
                </div>
              </>
            )}

            {view === "success" && (
              <div className="py-4 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <p id="tax-cert-modal-title" className="text-[17px] font-bold text-[#0F172A] dark:text-white mb-2">
                  Справка отправлена
                </p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Документы отправлены на{" "}
                  <span className="font-semibold text-[#0F172A] dark:text-white">{userEmail}</span>
                  . Ожидайте письмо в течение рабочего дня.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

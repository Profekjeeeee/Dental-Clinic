import Link from "next/link";

const groups = [
  { title: "Клиника", links: [["Врачи", "doctors"], ["Прайс", "price"], ["Настройки клиники", "settings"]] },
  { title: "Отчёты и работа с пациентами", links: [["Аналитика", "analytics"], ["CRM и рассылки", "crm"]] },
  { title: "Журналы", links: [["Лента событий", "feed"], ["Журнал изменений медданных", "audit"], ["Логи системы", "logs"]] },
];

export default function AdminMorePage() {
  return (
    <main className="min-h-dvh px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-safe">
      <h1 className="mb-6 text-2xl font-bold">Ещё</h1>
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map(({ title, links }) => (
          <section key={title}>
            <h2 className="mb-2 text-sm font-semibold text-secondary">{title}</h2>
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
              {links.map(([label, route]) => (
                <li key={route}>
                  <Link className="flex min-h-12 items-center justify-between gap-3 px-4 font-medium hover:text-primary" href={"/screens/admin/" + route}>
                    {label}<span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

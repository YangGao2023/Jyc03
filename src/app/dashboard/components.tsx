import type { ReactNode } from "react";

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-600">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-800">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {right ? <div>{right}</div> : null}
      </div>
    </div>
  );
}

export function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[24px] bg-white p-4 text-slate-700 shadow-sm ${className}`.trim()}>{children}</section>;
}

export function DashboardCardTitle({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        {desc ? <p className="mt-1 text-sm text-slate-500">{desc}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

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
    <div className="rounded-[24px] border border-blue-800/40 bg-blue-900/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-blue-200">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-200">{description}</p>
        </div>
        {right ? <div>{right}</div> : null}
      </div>
    </div>
  );
}

export function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[24px] bg-blue-900/20 p-4 text-blue-100 shadow-sm ${className}`.trim()}>{children}</section>;
}

export function DashboardCardTitle({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-blue-200">{title}</p>
        {desc ? <p className="mt-1 text-sm text-blue-300">{desc}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

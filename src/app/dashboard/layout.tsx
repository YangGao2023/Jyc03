import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  ["/dashboard", "首页"],
  ["/dashboard/overview", "总览"],
  ["/dashboard/biz", "业务"],
  ["/dashboard/tasks", "任务"],
  ["/dashboard/memory", "记忆"],
  ["/dashboard/system", "系统"],
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-600">JYC AI Control Center</p>
              <p className="mt-1 text-sm text-slate-600">首页、总览、业务、任务、记忆、系统六个区的统一导航壳</p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-gray-50"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}

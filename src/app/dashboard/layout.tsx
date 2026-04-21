import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  ["/dashboard", "首页"],
  ["/dashboard/overview", "总览"],
  ["/dashboard/tasks", "任务"],
  ["/dashboard/memory", "记忆"],
  ["/dashboard/system", "系统"],
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300">JYC AI Control Center</p>
              <p className="mt-1 text-sm text-slate-300">统一后台导航壳</p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
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

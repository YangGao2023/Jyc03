"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardPageHeader } from "../components";
import {
  bizOrders,
  bizCashEntries,
  bizClients,
  bizEmployees,
  bizExpenses,
  formatMoney,
  bizMaterials,
  bizAppointments,
  bizPayrolls,
  bizPurchases,
  bizQuotes,
  bizSettings,
  bizShowcases,
  bizSuppliers,
  summarizeOrders,
  type BizOrder,
  type BizSettings,
  type CashEntry,
  type ContactRecord,
  type EmployeeRecord,
  type ExpenseRecord,
  type MaterialRecord,
  type MaterialRow,
  type MeasurementAppointmentRecord,
  type PaymentRecord,
  type PayrollRecord,
  type PurchaseRecord,
  type QuoteRecord,
  type ShowcaseRecord,
  type SupplierRecord,
} from "@/lib/biz-data";
import type { BizStoreSnapshot } from "@/lib/biz-store";

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthIso() {
  return todayIso().slice(0, 7);
}

function addDaysIso(base: string, days: number) {
  const value = new Date(`${base}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  downloadTextFile(
    filename,
    rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n"),
    "text/csv;charset=utf-8",
  );
}

function downloadMappedCsv<T>(filename: string, headers: Array<string>, items: T[], mapRow: (item: T) => Array<string | number>) {
  downloadCsv(filename, [headers, ...items.map(mapRow)]);
}

// ─── primitives ──────────────────────────────────────────────────────────────

function PageSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
        {children}
      </div>
    </div>
  );
}

function DisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 opacity-60 cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function ActionBtn({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger" | "success";
}) {
  const tones = {
    default: "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
    primary: "border-slate-900 bg-slate-900 text-white hover:bg-slate-700 hover:border-slate-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  } as const;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/** Horizontal compact stat bar */
function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: string; accent?: string }>;
}) {
  return (
    <div className="mb-4 flex flex-wrap divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-[110px] flex-col px-5 py-3">
          <span className={`text-xl font-bold ${item.accent ?? "text-slate-800"}`}>
            {item.value}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-sky-600">{eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function EmptyTable({
  cols,
  message = "暂无数据",
}: {
  cols: string[];
  message?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={cols.length || 1} className="py-10 text-center text-sm text-slate-400">
              {message}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-lg px-5 py-1.5 text-xs font-semibold transition-colors ${
            value === o.key
              ? "bg-white text-slate-900 shadow"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function getOverviewDomains(
  orderSummary: ReturnType<typeof summarizeOrders>,
  data: {
    expenses: ExpenseRecord[];
    payrolls: PayrollRecord[];
    quotes: QuoteRecord[];
    clients: ContactRecord[];
    suppliers: SupplierRecord[];
    materials: MaterialRecord[];
    employees: EmployeeRecord[];
  },
): Array<{
  key: string;
  title: string;
  sub: string;
  color: string;
  dot: string;
  stats: Array<{ label: string; value: string; accent?: string }>;
}> {
  const totalExpense = data.expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalPayroll = data.payrolls.reduce((sum, item) => sum + item.net_salary, 0);
  const draftQuotes = data.quotes.filter((item) => item.status === "草稿").length;
  const sentQuotes = data.quotes.filter((item) => item.status === "已发送").length;
  const wonQuotes = data.quotes.filter((item) => item.status === "已成交").length;
  const lowStockCount = data.materials.filter((item) => item.stock_quantity <= item.min_stock).length;
  const activeEmployees = data.employees.filter((item) => item.status === "在职").length;
  const monthlyPayroll = data.payrolls
    .filter((item) => item.month === new Date().toISOString().slice(0, 7))
    .reduce((sum, item) => sum + item.net_salary, 0);

  return [
    {
      key: "orders",
      title: "订单管理",
      sub: "Order Management",
      color: "border-blue-200 bg-blue-50/40 hover:border-blue-300",
      dot: "bg-blue-500",
      stats: [
        { label: "全部订单", value: String(orderSummary.total) },
        { label: "未付清", value: formatMoney(orderSummary.balance), accent: "text-red-600" },
      ],
    },
    {
      key: "finance",
      title: "收支管理",
      sub: "Finance",
      color: "border-green-200 bg-green-50/40 hover:border-green-300",
      dot: "bg-green-500",
      stats: [
        { label: "收入", value: formatMoney(orderSummary.amountPaid), accent: "text-green-600" },
        { label: "净利润", value: formatMoney(orderSummary.amountPaid - totalExpense - totalPayroll), accent: "text-emerald-600" },
      ],
    },
    {
      key: "quotes",
      title: "报价展示",
      sub: "Quotes & Showcase",
      color: "border-violet-200 bg-violet-50/40 hover:border-violet-300",
      dot: "bg-violet-500",
      stats: [
        { label: "草稿 / 已发", value: `${draftQuotes} / ${sentQuotes}` },
        { label: "已成交", value: String(wonQuotes), accent: "text-green-600" },
      ],
    },
    {
      key: "clients",
      title: "客户档案",
      sub: "Contacts",
      color: "border-sky-200 bg-sky-50/40 hover:border-sky-300",
      dot: "bg-sky-500",
      stats: [
        { label: "客户", value: String(data.clients.length) },
        { label: "供应商", value: String(data.suppliers.length) },
      ],
    },
    {
      key: "materials",
      title: "物料库存",
      sub: "Inventory",
      color: "border-amber-200 bg-amber-50/40 hover:border-amber-300",
      dot: "bg-amber-500",
      stats: [
        { label: "品类", value: String(data.materials.length) },
        { label: "低库存预警", value: String(lowStockCount), accent: "text-orange-600" },
      ],
    },
    {
      key: "employees",
      title: "员工管理",
      sub: "Human Resources",
      color: "border-rose-200 bg-rose-50/40 hover:border-rose-300",
      dot: "bg-rose-500",
      stats: [
        { label: "在职员工", value: String(activeEmployees) },
        { label: "本月工资", value: formatMoney(monthlyPayroll), accent: "text-orange-600" },
      ],
    },
  ];
}

function OverviewSection({
  onNavigate,
  orderSummary,
  expenses,
  payrolls,
  quotes,
  clients,
  suppliers,
  materials,
  employees,
}: {
  onNavigate: (key: string) => void;
  orderSummary: ReturnType<typeof summarizeOrders>;
  expenses: ExpenseRecord[];
  payrolls: PayrollRecord[];
  quotes: QuoteRecord[];
  clients: ContactRecord[];
  suppliers: SupplierRecord[];
  materials: MaterialRecord[];
  employees: EmployeeRecord[];
}) {
  const domains = getOverviewDomains(orderSummary, { expenses, payrolls, quotes, clients, suppliers, materials, employees });

  function exportOverview() {
    downloadCsv(`biz-overview-${todayIso()}.csv`, [
      ["模块", "指标", "值"],
      ...domains.flatMap((domain) => domain.stats.map((stat) => [domain.title, stat.label, stat.value])),
    ]);
  }

  function printOverview() {
    openPrintWindow(buildSimpleTablePrintHTML("业务总览", "当前业务概况", ["模块", "指标", "值"], domains.flatMap((domain) => domain.stats.map((stat) => [domain.title, stat.label, stat.value]))));
  }

  return (
    <div>
      <SectionHeader eyebrow="Business Overview" title="业务总览" actions={<><ActionBtn onClick={exportOverview}>↓ 导出总览</ActionBtn><ActionBtn onClick={printOverview}>🖨 打印总览</ActionBtn></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => (
          <button
            key={d.key}
            onClick={() => onNavigate(d.key)}
            className={`group rounded-xl border p-4 text-left transition-all hover:shadow-md ${d.color}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${d.dot}`} />
                <span className="text-sm font-semibold text-slate-800">{d.title}</span>
              </div>
              <span className="text-xs text-slate-400 transition-colors group-hover:text-slate-600">
                {d.sub} →
              </span>
            </div>
            <div className="flex gap-6">
              {d.stats.map((s) => (
                <div key={s.label}>
                  <p className={`text-xl font-bold ${s.accent ?? "text-slate-700"}`}>{s.value}</p>
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Quick-links strip */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <p className="text-xs font-semibold text-slate-500">快捷入口</p>
        </div>
        <div className="flex flex-wrap divide-x divide-slate-100">
          {[
            { label: "新建定制单", section: "orders" },
            { label: "新建批发单", section: "orders" },
            { label: "录入支出", section: "finance" },
            { label: "新建报价单", section: "quotes" },
            { label: "添加客户", section: "clients" },
            { label: "采购入库", section: "materials" },
          ].map((q) => (
            <button
              key={q.label}
              onClick={() => onNavigate(q.section)}
              className="px-5 py-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Components ──────────────────────────────────────────────────

type DraftFields = {
  client_name: string;
  phone: string;
  address: string;
  preview_image: string;
  total_price: number;
  tax_rate: number;
  discount: number;
  description: string;
  install_info: string;
  remarks: string;
};

/** Derived total after tax and discount */
function calcTotalAfterTax(total: number, taxRate: number, discount: number) {
  return Math.max(0, total * (1 + taxRate / 100) - discount);
}

/** Derive status from financial state — mirrors legacy syncOrderBalance logic */
function deriveStatus(totalAfterTax: number, amountPaid: number, currentStatus: string): string {
  if (totalAfterTax > 0 && amountPaid >= totalAfterTax) return "结清";
  if (amountPaid > 0) return "未付清";
  if (currentStatus === "已关闭") return "已关闭";
  return "下单";
}

const PAYMENT_METHODS = ["现金", "微信", "支票", "刷卡", "转账", "银行转账", "Zelle"];

function EditField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
        />
      )}
    </div>
  );
}

function ReadonlyDisplay({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</label>
      <div className="flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "下单": "bg-blue-100 text-blue-700",
    "未付清": "bg-amber-100 text-amber-700",
    "结清": "bg-green-100 text-green-700",
    "已关闭": "bg-slate-100 text-slate-500",
  };
  const cls = colors[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function PaymentHistoryTable({ records }: { records: PaymentRecord[] }) {
  if (!records.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        暂无收款记录
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
            <th className="px-3 py-2 font-semibold text-slate-600">金额</th>
            <th className="px-3 py-2 font-semibold text-slate-600">方式</th>
            <th className="px-3 py-2 font-semibold text-slate-600">类型</th>
            <th className="px-3 py-2 font-semibold text-slate-600">备注</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2 text-slate-600">{r.date}</td>
              <td className={`px-3 py-2 font-medium ${r.type === "refund" ? "text-red-600" : "text-green-600"}`}>
                {r.type === "refund" ? "-" : "+"}{formatMoney(r.amount)}
              </td>
              <td className="px-3 py-2 text-slate-600">{r.method}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  r.type === "refund" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                }`}>
                  {r.type === "refund" ? "退款" : "收款"}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-500">{r.note ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialRowsTable({ rows }: { rows: MaterialRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        暂无物料记录
      </div>
    );
  }
  const subtotal = rows.reduce((sum, r) => sum + r.qty * r.unit_price, 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 font-semibold text-slate-600">品名</th>
            <th className="px-3 py-2 font-semibold text-slate-600">规格</th>
            <th className="px-3 py-2 font-semibold text-slate-600">数量</th>
            <th className="px-3 py-2 font-semibold text-slate-600">单位</th>
            <th className="px-3 py-2 font-semibold text-slate-600">单价</th>
            <th className="px-3 py-2 font-semibold text-slate-600">小计</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              <td className="px-3 py-2 text-slate-600">{r.spec ?? "-"}</td>
              <td className="px-3 py-2 text-slate-700">{r.qty}</td>
              <td className="px-3 py-2 text-slate-600">{r.unit}</td>
              <td className="px-3 py-2 text-slate-700">{formatMoney(r.unit_price)}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{formatMoney(r.qty * r.unit_price)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
              物料小计 / Subtotal
            </td>
            <td className="px-3 py-2 font-bold text-slate-900">{formatMoney(subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EditableMaterialRows({
  rows,
  onChange,
}: {
  rows: MaterialRow[];
  onChange: (rows: MaterialRow[]) => void;
}) {
  function updateRow(i: number, key: keyof MaterialRow, val: string | number) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function deleteRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...rows, { name: "", qty: 1, unit: "个", unit_price: 0 }]);
  }
  function handleRowImage(i: number, file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      updateRow(i, "image", result);
    };
    reader.readAsDataURL(file);
  }
  const subtotal = rows.reduce((sum, r) => sum + r.qty * r.unit_price, 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-2 py-2 font-semibold text-slate-600">品名</th>
              <th className="px-2 py-2 font-semibold text-slate-600">规格</th>
              <th className="px-2 py-2 font-semibold text-slate-600 w-16">数量</th>
              <th className="px-2 py-2 font-semibold text-slate-600 w-14">单位</th>
              <th className="px-2 py-2 font-semibold text-slate-600 w-20">单价</th>
              <th className="px-2 py-2 font-semibold text-slate-600 w-20">小计</th>
              <th className="px-2 py-2 font-semibold text-slate-600 w-16">图片</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-2 py-1.5">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                    className="h-7 w-full min-w-[100px] rounded border border-slate-300 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.spec ?? ""}
                    onChange={(e) => updateRow(i, "spec", e.target.value)}
                    className="h-7 w-full min-w-[80px] rounded border border-slate-300 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={r.qty}
                    onChange={(e) => updateRow(i, "qty", Number(e.target.value) || 0)}
                    className="h-7 w-16 rounded border border-slate-300 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(i, "unit", e.target.value)}
                    className="h-7 w-14 rounded border border-slate-300 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={r.unit_price}
                    onChange={(e) => updateRow(i, "unit_price", Number(e.target.value) || 0)}
                    className="h-7 w-20 rounded border border-slate-300 px-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5 font-medium text-slate-800 whitespace-nowrap">
                  {formatMoney(r.qty * r.unit_price)}
                </td>
                <td className="px-2 py-1.5">
                  <label className="relative block h-8 w-10 cursor-pointer overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {r.image ? (
                      <img src={r.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">+图</span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleRowImage(i, e.target.files?.[0])}
                    />
                  </label>
                </td>
                <td className="px-1 py-1.5">
                  <button
                    onClick={() => deleteRow(i)}
                    className="rounded px-1.5 py-1 text-[11px] text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-slate-50">
                <td colSpan={5} className="px-2 py-2 text-right text-xs font-semibold text-slate-600">
                  物料小计 / Subtotal
                </td>
                <td className="px-2 py-2 font-bold text-slate-900">{formatMoney(subtotal)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + 添加物料行
      </button>
    </div>
  );
}

function buildCustomerInvoiceHTML(order: BizOrder, draft: DraftFields, rows: MaterialRow[]): string {
  const brandBlue = "#0457da";
  const isCustom = order.order_type === "定制单";
  const taxAmount = (draft.total_price || 0) * (draft.tax_rate || 0) / 100;
  const totalAfterTax = calcTotalAfterTax(draft.total_price || 0, draft.tax_rate || 0, draft.discount || 0);
  const photo = draft.preview_image
    ? `<img src="${escHtml(draft.preview_image)}" alt="preview" style="width:100%;height:100%;object-fit:cover;display:block"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#dbeafe;color:#1e3a8a;font-weight:700;font-size:18px">PHOTO</div>`;
  const notes = (draft.remarks || `1. Customer will be billed after indicating acceptance of this quote.
2. 40% deposit required when placing the order.
3. When the job is complete, the balance must be paid in full.
4. Extra requirements will charge extra.
5. Warranty depends on the size and style.`)
    .split(/\n+/)
    .filter(Boolean)
    .map((line, index) => `<div style="margin-bottom:4px">${index + 1}. ${escHtml(line.replace(/^\d+[.)]?\s*/, ""))}</div>`)
    .join("");

  const matRowsHTML = rows.length
    ? rows.map((r) => `<tr><td style="border:1px solid #d4d4d4;padding:6px 8px">${escHtml(r.name)}</td><td style="border:1px solid #d4d4d4;padding:6px 8px">${escHtml(r.spec ?? "")}</td><td style="border:1px solid #d4d4d4;padding:6px 8px;text-align:center">${r.qty} ${escHtml(r.unit)}</td><td style="border:1px solid #d4d4d4;padding:6px 8px;text-align:right">${formatMoney(r.qty * r.unit_price)}</td></tr>`).join("")
    : `<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8">No items listed</td></tr>`;

  const middleSection = isCustom
    ? `<div class="middle">
    <div class="photoWrap">
      <div class="photoInner">${photo}</div>
      <div class="photoCode">${escHtml(order.order_number)}</div>
    </div>
    <div class="descWrap"><div style="padding:10px;font-size:13px;line-height:1.65;color:#111827;min-height:260px">${escHtml(draft.description || "-")}</div></div>
  </div>`
    : `<div style="margin:0 4px 4px">
    <div class="sectionBlue">Product Information / 产品信息</div>
    <div style="border:1px solid #a3a3a3;background:#fff;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="border:1px solid #a3a3a3;padding:7px 8px;text-align:left;background:#f8fafc;font-weight:600">Product / 品名</th>
          <th style="border:1px solid #a3a3a3;padding:7px 8px;text-align:left;background:#f8fafc;font-weight:600">Spec / 规格</th>
          <th style="border:1px solid #a3a3a3;padding:7px 8px;text-align:center;background:#f8fafc;font-weight:600;width:80px">Qty / 数量</th>
          <th style="border:1px solid #a3a3a3;padding:7px 8px;text-align:right;background:#f8fafc;font-weight:600;width:100px">Subtotal / 小计</th>
        </tr></thead>
        <tbody>${matRowsHTML}</tbody>
      </table>
    </div>
  </div>`;

  return buildPrintShell("Invoice", `
  <div class="topbar">
    <div class="topbox">
      <div>
        <h1>34-41 College Point Blvd, Flushing, NY,11354</h1>
        <p>JYC STEEL GROUP INC</p>
      </div>
      <div style="text-align:right" class="officePhone">
        <h1>OFFICE: 347-251-1719</h1>
      </div>
    </div>
    <div class="topbox" style="justify-content:center;text-align:center">
      <div><h1>JYC STEEL GROUP INC</h1></div>
    </div>
  </div>

  <div class="contactInvoice">
    <div class="panel">
      <div class="sectionBlue">Contact Information</div>
      <div class="rows">
        <div class="row">
          <div class="cell label">Name:</div>
          <div class="cell">${escHtml(draft.client_name || "-")}</div>
          <div class="cell label">Phone:</div>
          <div class="cell">${escHtml(draft.phone || "-")}</div>
        </div>
        <div class="row" style="grid-template-columns:64px 1fr">
          <div class="cell label">Address:</div>
          <div class="cell">${escHtml(draft.address || "-")}</div>
        </div>
      </div>
    </div>
    <div class="panel invoiceBox">
      <div class="sectionBlue" style="text-align:center">Invoice</div>
      <div class="big">${escHtml(order.order_number)}</div>
      <div class="date">${escHtml(order.order_date || "-")}</div>
    </div>
  </div>

  <div class="midBlue">
    <span>WWW.JYCNYC.NET</span>
    <span>Zelle 3478227777</span>
  </div>

  ${middleSection}

  <div class="bottom">
    <div class="bottomCol">
      <div class="sectionBlue">Note</div>
      <div class="noteBody">${notes}</div>
    </div>
    <div class="bottomCol">
      <div class="sectionBlue">Sub Total: <span style="float:right">${(draft.total_price || 0).toFixed(2)}</span></div>
      <div class="totalBody">
        ${draft.tax_rate ? `<div class="totalRow"><span>Tax (${draft.tax_rate}%):</span><span class="v">${taxAmount.toFixed(2)}</span></div>` : '<div class="totalRow"><span>Tax:</span><span class="v">0.00</span></div>'}
        ${draft.discount ? `<div class="totalRow"><span>Discount:</span><span class="v" style="color:#e11d48">-${(draft.discount || 0).toFixed(2)}</span></div>` : ''}
        <div class="totalRow"><span>Total:</span><span class="v">${totalAfterTax.toFixed(2)}</span></div>
        <div class="totalRow"><span>Deposit:</span><span class="v">${(order.amount_paid || 0).toFixed(2)}</span></div>
        <div class="totalRow" style="color:#dc2626"><span>Balance:</span><span class="v" style="color:#dc2626">${Math.max(0, totalAfterTax - (order.amount_paid || 0)).toFixed(2)}</span></div>
      </div>
    </div>
  </div>
`, { pageTitle: `Invoice ${order.order_number}`, bodyPadding: "0", maxWidth: "202mm", extraStyles: `@page{size:A4 portrait;margin:4mm}.sheet{width:202mm;height:289mm;overflow:hidden;border:1px solid #a3a3a3;background:#fff}.topbar{display:grid;grid-template-columns:1.2fr 1fr;gap:4px;padding:4px;background:${brandBlue}}.topbox{background:${brandBlue};color:#fff;padding:10px 12px;min-height:52px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.35)}.topbox h1{font-size:14px;font-weight:800;letter-spacing:.02em;color:#fff}.topbox p{font-size:10px;line-height:1.2;color:rgba(255,255,255,.92)}.sectionBlue{background:${brandBlue};color:#fff;font-weight:700;padding:7px 10px;font-size:13px}.contactInvoice{display:grid;grid-template-columns:2.4fr 1fr;gap:4px;padding:0 4px 4px;background:${brandBlue}}.panel{border:1px solid #a3a3a3;background:#fff}.rows{padding:0;background:#fff}.row{display:grid;grid-template-columns:58px 1fr 58px 1fr;border-top:1px solid #d4d4d4}.row:first-child{border-top:none}.cell{padding:8px 10px;font-size:11px}.label{font-weight:700}.invoiceBox .big{font-size:16px;font-weight:800;text-align:center;padding:14px 10px;border-top:1px solid #d4d4d4}.invoiceBox .date{font-size:14px;font-weight:800;text-align:center;padding:14px 10px;border-top:1px solid #d4d4d4}.midBlue{margin:0 4px 4px;background:${brandBlue};color:#fff;padding:7px 10px;font-size:11px;font-weight:700;display:flex;justify-content:space-between}.middle{display:grid;grid-template-columns:1.08fr 0.92fr;gap:4px;padding:0 4px 4px}.photoWrap{border:1px solid #a3a3a3;background:#fff;height:148mm;position:relative;padding:4px}.photoInner{height:100%;border:1px solid #111827;background:#e5e7eb;overflow:hidden}.photoCode{position:absolute;left:12px;bottom:8px;font-size:24px;font-weight:900;letter-spacing:.04em;color:#111}.descWrap{border:1px solid #a3a3a3;background:#fff;height:148mm;overflow:hidden}.descWrap > div{padding:10px!important;font-size:12px!important;line-height:1.45!important;min-height:auto!important}.bottom{display:grid;grid-template-columns:1.2fr .9fr;gap:4px;padding:0 4px 4px}.noteBody{border:1px solid #a3a3a3;background:#fff;padding:10px;min-height:72mm;font-size:11px;line-height:1.45;overflow:hidden}.totalBody{border:1px solid #a3a3a3;background:#fff;padding:10px 12px;min-height:72mm;display:flex;flex-direction:column;justify-content:center;gap:10px}.totalRow{display:flex;justify-content:space-between;font-size:15px;font-weight:800}.totalRow .v{color:#2b6fdb}@media print{html,body{margin:0!important;padding:0!important}.sheet{border:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid;page-break-inside:avoid}}` });
}

type PrintShellOptions = {
  pageTitle?: string;
  maxWidth?: string;
  bodyPadding?: string;
  extraStyles?: string;
};

const DEFAULT_PRINT_SHELL: Required<Pick<PrintShellOptions, "maxWidth" | "bodyPadding" | "extraStyles">> = {
  maxWidth: "1080px",
  bodyPadding: "28px",
  extraStyles: "",
};

const BASE_PRINT_TYPOGRAPHY_STYLES = ".muted{color:#64748b}.title{font-weight:800}";
const STANDARD_TABLE_PRINT_STYLES = `${BASE_PRINT_TYPOGRAPHY_STYLES}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px}.title{font-size:28px}.muted{font-size:12px}table{width:100%;border-collapse:collapse}`;
const QUOTE_PRINT_STYLES = `${BASE_PRINT_TYPOGRAPHY_STYLES}.brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:16px;margin-bottom:24px}.title{font-size:30px;letter-spacing:.04em}.card{border:1px solid #cbd5e1;border-radius:16px;padding:18px 20px;margin-bottom:16px}.row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dashed #e2e8f0}.row:last-child{border-bottom:none}.amount{font-size:28px;font-weight:800;color:#0f766e}.footer{margin-top:24px;border-top:1px solid #cbd5e1;padding-top:16px;font-size:12px;line-height:1.7;color:#475569}`;

function buildStandardPrintHeader(title: string, subtitle: string) {
  return `<div class="head"><div><div class="title">${escHtml(title)}</div><div class="muted">${escHtml(subtitle)}</div></div><div class="muted">Printed ${escHtml(new Date().toLocaleString())}</div></div>`;
}

function buildPrintShell(title: string, body: string, options?: PrintShellOptions) {
  const config = {
    ...DEFAULT_PRINT_SHELL,
    ...options,
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(config.pageTitle || title)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;padding:${config.bodyPadding};background:#fff}.sheet{max-width:${config.maxWidth};margin:0 auto}${config.extraStyles}@media print{body{padding:0}.sheet{max-width:none}}
</style></head><body><div class="sheet">${body}</div><script>window.onload=function(){window.print();}<\/script></body></html>`;
}

function buildWorkerPickupHTML(order: BizOrder, rows: MaterialRow[]): string {
  const rowsHTML = rows.length
    ? rows
        .map(
          (r, i) =>
            `<tr>
              <td style="text-align:center;border:1px solid #bfdbfe;padding:10px 8px;font-size:15px;font-weight:700;color:#1e40af">${i + 1}</td>
              <td style="border:1px solid #bfdbfe;padding:10px 8px">
                <div style="font-weight:600;font-size:13px">${escHtml(r.name)}</div>
                ${r.spec ? `<div style="color:#64748b;font-size:11px;margin-top:2px">${escHtml(r.spec)}</div>` : ""}
              </td>
              <td style="text-align:center;border:1px solid #bfdbfe;padding:10px 8px;font-size:18px;font-weight:800;color:#1e293b">${r.qty}<br><span style="font-size:11px;font-weight:400;color:#64748b">${escHtml(r.unit)}</span></td>
              <td style="text-align:center;border:1px solid #bfdbfe;padding:8px">
                ${r.image
                  ? `<img src="${escHtml(r.image)}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;display:block;margin:0 auto">`
                  : '<span style="color:#cbd5e1;font-size:22px">□</span>'}
              </td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="4" style="padding:24px;text-align:center;color:#94a3b8;border:1px solid #bfdbfe">暂无物料 / No materials</td></tr>`;

  return buildPrintShell("领料单 / Worker Pickup Sheet", `
<div style="border-bottom:3px solid #1e40af;padding-bottom:14px;margin-bottom:18px">
  <h1 style="font-size:22px;font-weight:800;color:#1e40af">领料单 / Worker Pickup Sheet</h1>
  <p style="margin-top:6px;color:#475569;font-size:13px">${escHtml(order.order_number)} &nbsp;·&nbsp; ${escHtml(order.client_name)} &nbsp;·&nbsp; ${escHtml(order.order_date ?? "-")}</p>
</div>
<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr style="background:#eff6ff">
      <th style="border:1px solid #bfdbfe;padding:10px 8px;text-align:center;font-size:12px;width:44px">#</th>
      <th style="border:1px solid #bfdbfe;padding:10px 8px;text-align:left;font-size:12px">品名 / Name</th>
      <th style="border:1px solid #bfdbfe;padding:10px 8px;text-align:center;font-size:12px;width:100px">数量 / Qty</th>
      <th style="border:1px solid #bfdbfe;padding:10px 8px;text-align:center;font-size:12px;width:90px">图片 / Image</th>
    </tr>
  </thead>
  <tbody>${rowsHTML}</tbody>
</table>`, { pageTitle: `领料单 · ${order.order_number}` });
}

function buildQuotePrintHTML(quote: QuoteRecord, settings: BizSettings): string {
  return buildPrintShell("QUOTE", `
<div class="brand"><div><div class="title">QUOTE</div><div class="muted">${escHtml(settings.company_name || "Company")}</div><div class="muted">${escHtml(settings.address || "")}</div><div class="muted">${escHtml(settings.phone || "")}${settings.email ? ` · ${escHtml(settings.email)}` : ""}</div></div><div style="text-align:right"><div><strong>${escHtml(quote.id)}</strong></div><div class="muted">Created: ${escHtml(quote.created_at)}</div><div class="muted">Valid Until: ${escHtml(quote.valid_until)}</div><div class="muted">Status: ${escHtml(quote.status)}</div></div></div>
<div class="card"><div class="row"><span class="muted">Client</span><strong>${escHtml(quote.client_name)}</strong></div><div class="row"><span class="muted">Project</span><strong>${escHtml(quote.title)}</strong></div><div class="row"><span class="muted">Quoted Amount</span><span class="amount">${escHtml(formatMoney(quote.amount))}</span></div></div>
<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:10px">Payment & Contact</div><div class="row"><span class="muted">Bank</span><span>${escHtml(settings.bank_account || "-")}</span></div><div class="row"><span class="muted">WeChat Pay</span><span>${escHtml(settings.wechat_pay || "-")}</span></div><div class="row"><span class="muted">Alipay</span><span>${escHtml(settings.alipay || "-")}</span></div><div class="row"><span class="muted">Other</span><span>${escHtml(settings.other_payment || "-")}</span></div></div>
<div class="footer">${escHtml(settings.quote_footer || "")}</div>
`, { pageTitle: `Quote ${quote.id}`, maxWidth: "820px", extraStyles: QUOTE_PRINT_STYLES });
}

function buildSimpleTablePrintHTML(title: string, subtitle: string, columns: string[], rows: Array<Array<string | number>>) {
  const headerHtml = columns
    .map((column) => `<th style="border:1px solid #cbd5e1;padding:10px 8px;background:#f8fafc;text-align:left;font-size:12px">${escHtml(column)}</th>`)
    .join("");
  const bodyHtml = rows.length
    ? rows
        .map(
          (row) => `<tr>${row
            .map((cell) => `<td style="border:1px solid #e2e8f0;padding:9px 8px;font-size:12px;vertical-align:top">${escHtml(String(cell ?? "-"))}</td>`)
            .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" style="border:1px solid #e2e8f0;padding:18px 8px;text-align:center;color:#64748b;font-size:12px">暂无数据</td></tr>`;

  return buildPrintShell(title, `${buildStandardPrintHeader(title, subtitle)}<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`, { extraStyles: STANDARD_TABLE_PRINT_STYLES });
}

function openPrintWindow(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    window.removeEventListener("focus", handleFocusBack);
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 100);
  };

  const handleFocusBack = () => {
    cleanup();
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    cleanup();
    return;
  }

  const patchedHtml = html.replace(
    /<script>window\.onload=function\(\)\{window\.print\(\);\}<\\\/script><\/body><\/html>$/,
    "</body></html>"
  );

  doc.open();
  doc.write(patchedHtml);
  doc.close();

  window.addEventListener("focus", handleFocusBack, { once: true });

  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (error) {
      cleanup();
    }
  }, 80);

  setTimeout(cleanup, 4000);
}

/** Full order detail panel — replaces the list view when an order is selected */
function OrderDetailView({
  order,
  onBack,
  onSave,
}: {
  order: BizOrder;
  onBack: () => void;
  onSave: (updated: BizOrder) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isCustom = order.order_type === "定制单";

  const [draft, setDraft] = useState<DraftFields>({
    client_name: order.client_name,
    phone: order.phone ?? "",
    address: order.address ?? "",
    preview_image: order.preview_image ?? "",
    total_price: order.total_price ?? 0,
    tax_rate: order.tax_rate ?? 0,
    discount: order.discount ?? 0,
    description: order.description ?? "",
    install_info: order.install_info ?? "",
    remarks: order.remarks ?? "",
  });

  const [materialRows, setMaterialRows] = useState<MaterialRow[]>(order.material_rows ?? []);

  function handleMaterialRowsChange(rows: MaterialRow[]) {
    setMaterialRows(rows);
    if (!isCustom) {
      // Auto-sync total_price from material subtotal for wholesale orders
      const subtotal = rows.reduce((s, r) => s + r.qty * r.unit_price, 0);
      setDraft((d) => ({ ...d, total_price: subtotal }));
    }
  }

  const [paymentMode, setPaymentMode] = useState<"payment" | "refund">("payment");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    date: today,
    amount: "",
    method: "现金",
    note: "",
  });

  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleImageUpload(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      update("preview_image", result);
    };
    reader.readAsDataURL(file);
  }

  function buildUpdated(): BizOrder {
    const totalAfterTax = calcTotalAfterTax(draft.total_price, draft.tax_rate, draft.discount);
    return {
      ...order,
      client_name: draft.client_name,
      phone: draft.phone || undefined,
      address: draft.address || undefined,
      preview_image: isCustom ? draft.preview_image || undefined : undefined,
      total_price: draft.total_price,
      tax_rate: draft.tax_rate || undefined,
      discount: draft.discount || undefined,
      total_after_tax: totalAfterTax,
      description: draft.description || undefined,
      install_info: isCustom ? draft.install_info || undefined : undefined,
      remarks: draft.remarks || undefined,
      material_rows: isCustom ? undefined : materialRows,
    };
  }

  function handleSave() {
    onSave(buildUpdated());
  }

  function handleAddPayment() {
    const amount = Number(newPayment.amount) || 0;
    if (amount <= 0) return;
    const record: PaymentRecord = {
      date: newPayment.date,
      amount,
      method: newPayment.method,
      note: newPayment.note || undefined,
      type: paymentMode,
    };
    const history = [...(order.payment_history ?? []), record];
    const amountPaid =
      history.filter((r) => r.type === "payment").reduce((s, r) => s + r.amount, 0) -
      history.filter((r) => r.type === "refund").reduce((s, r) => s + r.amount, 0);
    const totalAfterTax = calcTotalAfterTax(draft.total_price, draft.tax_rate, draft.discount);
    const balance = Math.max(0, totalAfterTax - amountPaid);
    const status = deriveStatus(totalAfterTax, amountPaid, order.status ?? "下单");
    onSave({
      ...buildUpdated(),
      payment_history: history,
      amount_paid: amountPaid,
      balance,
      status,
    });
    setNewPayment({ date: today, amount: "", method: "现金", note: "" });
    setShowAddPayment(false);
  }

  return (
    <div>
      {/* Detail header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
        >
          ← 返回列表
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{order.order_number}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              isCustom ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {order.order_type}
          </span>
          <StatusBadge status={order.status ?? "下单"} />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => openPrintWindow(buildCustomerInvoiceHTML(order, draft, materialRows))}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700"
          >
            打印发票
          </button>
          {!isCustom && (
            <button
              onClick={() => openPrintWindow(buildWorkerPickupHTML(order, materialRows))}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              打印领料单
            </button>
          )}
          {order.status !== "已关闭" && (
            <button
              onClick={() => onSave({ ...buildUpdated(), status: "已关闭" })}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors"
            >
              关闭订单
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            保存更改
          </button>
        </div>
      </div>

      {/* Main content stack */}
      <div className="space-y-4">
        {/* Top summary: client info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            客户信息
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <EditField
              label="客户名称"
              value={draft.client_name}
              onChange={(v) => update("client_name", v)}
            />
            <EditField
              label="联系电话"
              value={draft.phone}
              onChange={(v) => update("phone", v)}
              type="tel"
            />
            <ReadonlyDisplay label="下单日期">{order.order_date || "-"}</ReadonlyDisplay>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <EditField
              label="地址"
              value={draft.address}
              onChange={(v) => update("address", v)}
            />
            <ReadonlyDisplay label="状态">
              <StatusBadge status={order.status ?? "下单"} />
            </ReadonlyDisplay>
          </div>
        </div>

        {/* Description section */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            工程说明
          </h3>
          <div className={isCustom ? "flex gap-4" : ""}>
            <div className="flex-1 space-y-3">
              <EditField
                label="说明"
                value={draft.description}
                onChange={(v) => update("description", v)}
                multiline
              />
              {isCustom && (
                <EditField
                  label="安装说明"
                  value={draft.install_info}
                  onChange={(v) => update("install_info", v)}
                  multiline
                />
              )}
              <EditField
                label="备注"
                value={draft.remarks}
                onChange={(v) => update("remarks", v)}
                multiline
              />
            </div>

            {/* 款式图片 — custom orders only */}
            {isCustom && (
              <div className="shrink-0">
                <p className="mb-1 text-[11px] font-semibold text-slate-500">款式图片</p>
                <label className="group relative block h-[160px] w-[120px] cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {draft.preview_image ? (
                    <img
                      src={draft.preview_image}
                      alt="款式图片"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-slate-400 text-center px-2">
                      暂无图片
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="text-[11px] font-semibold text-white text-center px-2 leading-snug">
                      {draft.preview_image ? "点击替换" : "点击上传"}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e.target.files?.[0])}
                  />
                </label>
                {draft.preview_image && (
                  <button
                    type="button"
                    onClick={() => update("preview_image", "")}
                    className="mt-1.5 w-full rounded border border-slate-200 py-1 text-[11px] text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors"
                  >
                    移除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Wholesale: editable material rows */}
        {!isCustom && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">物料清单</h3>
              <span className="text-[11px] text-slate-400">编辑行时自动同步总价</span>
            </div>
            <EditableMaterialRows rows={materialRows} onChange={handleMaterialRowsChange} />
          </div>
        )}

        {/* Bottom: 金额结算 + 收款记录 */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* 金额结算 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              金额结算
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  总价 {!isCustom && <span className="font-normal text-slate-400">(物料自动同步)</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.total_price}
                  onChange={(e) => update("total_price", Number(e.target.value) || 0)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">税率 %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={draft.tax_rate}
                    onChange={(e) => update("tax_rate", Number(e.target.value) || 0)}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">折扣 $</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={draft.discount}
                    onChange={(e) => update("discount", Number(e.target.value) || 0)}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              {(draft.tax_rate > 0 || draft.discount > 0) && (
                <ReadonlyDisplay label="税后合计">
                  <span className="font-semibold text-slate-800">
                    {formatMoney(calcTotalAfterTax(draft.total_price, draft.tax_rate, draft.discount))}
                  </span>
                </ReadonlyDisplay>
              )}
              <ReadonlyDisplay label="已付款">
                <span className="font-semibold text-green-600">
                  {formatMoney(order.amount_paid ?? 0)}
                </span>
              </ReadonlyDisplay>
              <ReadonlyDisplay label="余款">
                <span className="font-semibold text-red-600">
                  {formatMoney(order.balance ?? 0)}
                </span>
              </ReadonlyDisplay>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">状态</label>
                <div className="flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                  <StatusBadge status={order.status ?? "下单"} />
                </div>
              </div>
              <ReadonlyDisplay label="下单日期">
                {order.order_date || "-"}
              </ReadonlyDisplay>
            </div>
          </div>

          {/* 收款记录 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">收款记录</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPaymentMode("payment");
                    setShowAddPayment(true);
                  }}
                  className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  + 收款
                </button>
                <button
                  onClick={() => {
                    setPaymentMode("refund");
                    setShowAddPayment(true);
                  }}
                  className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  + 退款
                </button>
              </div>
            </div>

            {showAddPayment && (
              <div className={`mb-3 rounded-lg p-3 ${paymentMode === "payment" ? "border border-blue-100 bg-blue-50/50" : "border border-rose-100 bg-rose-50/50"}`}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">日期</label>
                    <input
                      type="date"
                      value={newPayment.date}
                      onChange={(e) => setNewPayment((p) => ({ ...p, date: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">金额</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment((p) => ({ ...p, amount: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">方式</label>
                    <select
                      value={newPayment.method}
                      onChange={(e) => setNewPayment((p) => ({ ...p, method: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">备注</label>
                    <input
                      type="text"
                      placeholder="可选备注"
                      value={newPayment.note}
                      onChange={(e) => setNewPayment((p) => ({ ...p, note: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleAddPayment}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${paymentMode === "payment" ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-600 hover:bg-rose-700"}`}
                  >
                    {paymentMode === "payment" ? "确认收款" : "确认退款"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddPayment(false);
                      setPaymentMode("payment");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            <PaymentHistoryTable records={order.payment_history ?? []} />
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── New Order Modal ──────────────────────────────────────────────────────────

function NewOrderModal({
  type,
  existingOrders,
  onClose,
  onCreate,
}: {
  type: "定制单" | "批发单";
  existingOrders: BizOrder[];
  onClose: () => void;
  onCreate: (order: BizOrder) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [fields, setFields] = useState({
    client_name: "",
    phone: "",
    address: "",
    description: "",
    total_price: "",
    deposit: "",
    deposit_method: "现金",
    deposit_note: "",
  });

  function set(key: string, val: string) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  function handleCreate() {
    if (!fields.client_name.trim()) return;
    const prefix = type === "定制单" ? "C" : "W";
    const year = new Date().getFullYear();
    const existing = existingOrders.filter((o) =>
      o.order_number.startsWith(`${prefix}-${year}-`)
    );
    const nextNum = existing.length + 1;
    const orderNumber = `${prefix}-${year}-${String(nextNum).padStart(4, "0")}`;

    const totalPrice = Number(fields.total_price) || 0;
    const deposit = Number(fields.deposit) || 0;
    const balance = Math.max(0, totalPrice - deposit);
    const status = deriveStatus(totalPrice, deposit, "下单");

    const paymentHistory: PaymentRecord[] =
      deposit > 0
        ? [
            {
              date: today,
              amount: deposit,
              method: fields.deposit_method,
              note: fields.deposit_note || undefined,
              type: "payment",
            },
          ]
        : [];

    const newOrder: BizOrder = {
      order_number: orderNumber,
      order_type: type,
      client_name: fields.client_name.trim(),
      phone: fields.phone || undefined,
      address: fields.address || undefined,
      description: fields.description || undefined,
      total_price: totalPrice,
      amount_paid: deposit,
      balance,
      order_date: today,
      status,
      payment_history: paymentHistory,
    };
    onCreate(newOrder);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">
            新建{type}
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                客户名称 *
              </label>
              <input
                type="text"
                value={fields.client_name}
                onChange={(e) => set("client_name", e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">联系电话</label>
              <input
                type="tel"
                value={fields.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">地址</label>
            <input
              type="text"
              value={fields.address}
              onChange={(e) => set("address", e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">说明</label>
            <textarea
              value={fields.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">总价</label>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={fields.total_price}
              onChange={(e) => set("total_price", e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              首付 / 定金（可选）
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">金额</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={fields.deposit}
                  onChange={(e) => set("deposit", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">方式</label>
                <select
                  value={fields.deposit_method}
                  onChange={(e) => set("deposit_method", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">备注</label>
                <input
                  type="text"
                  placeholder="定金备注"
                  value={fields.deposit_note}
                  onChange={(e) => set("deposit_note", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:border-slate-400 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!fields.client_name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            创建订单
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────────

const ORDER_COLS = ["订单号", "类型", "客户", "描述", "总金额", "下单日期", "状态", "余款", "操作"];

function OrdersSection({
  orders,
  setOrders,
}: {
  orders: BizOrder[];
  setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>;
}) {
  function exportOrders() {
    const rows = [
      ["订单号", "类型", "客户", "电话", "总额", "已付", "余款", "状态", "日期"],
      ...orders.map((item) => [
        item.order_number,
        item.order_type,
        item.client_name,
        item.phone ?? "",
        String(item.total_after_tax ?? item.total_price ?? 0),
        String(item.amount_paid ?? 0),
        String(item.balance ?? 0),
        item.status ?? "",
        item.order_date ?? "",
      ]),
    ];
    downloadCsv(`biz-orders-${todayIso()}.csv`, rows);
  }
  function printOrders() {
    openPrintWindow(buildSimpleTablePrintHTML("订单列表", `共 ${filteredOrders.length} 条`, ["订单号", "类型", "客户", "电话", "总额", "已付", "余款", "状态", "日期"], filteredOrders.map((item) => [item.order_number, item.order_type, item.client_name, item.phone ?? "-", formatMoney(item.total_after_tax ?? item.total_price ?? 0), formatMoney(item.amount_paid ?? 0), formatMoney(item.balance ?? 0), item.status ?? "-", item.order_date ?? "-"])));
  }
  const [selectedOrder, setSelectedOrder] = useState<BizOrder | null>(null);
  const [typeFilter, setTypeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [dateFilter, setDateFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const [createType, setCreateType] = useState<"定制单" | "批发单" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function handleSave(updated: BizOrder) {
    setOrders((prev) =>
      prev.map((o) => (o.order_number === updated.order_number ? updated : o))
    );
    setSelectedOrder(updated);
  }

  function handleCreate(newOrder: BizOrder) {
    setOrders((prev) => [newOrder, ...prev]);
  }

  function handleDelete(orderNumber: string) {
    setOrders((prev) => prev.filter((o) => o.order_number !== orderNumber));
    setDeleteConfirm(null);
  }

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    // Monday of current week
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7); // "YYYY-MM"

    return orders.filter((order) => {
      const matchesSearch =
        !search.trim() ||
        order.order_number.toLowerCase().includes(search.trim().toLowerCase()) ||
        order.client_name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (order.description ?? "").toLowerCase().includes(search.trim().toLowerCase());
      const matchesType = typeFilter === "全部" || order.order_type === typeFilter;
      const matchesStatus = statusFilter === "全部" || order.status === statusFilter;
      const d = order.order_date ?? "";
      const matchesDate =
        dateFilter === "全部" ||
        (dateFilter === "今天" && d === todayStr) ||
        (dateFilter === "本周" && d >= weekStartStr && d <= todayStr) ||
        (dateFilter === "本月" && d.startsWith(monthStr));
      return matchesSearch && matchesType && matchesStatus && matchesDate;
    });
  }, [search, typeFilter, statusFilter, dateFilter, orders]);

  const summary = summarizeOrders(filteredOrders);

  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onSave={handleSave}
      />
    );
  }

  return (
    <div>
      {createType && (
        <NewOrderModal
          type={createType}
          existingOrders={orders}
          onClose={() => setCreateType(null)}
          onCreate={handleCreate}
        />
      )}

      <SectionHeader
        eyebrow="Order Management"
        title="订单管理"
        actions={
          <>
            <ActionBtn onClick={exportOrders}>↓ 导出订单</ActionBtn>
            <ActionBtn onClick={printOrders}>🖨 打印当前表</ActionBtn>
            <button
              onClick={() => setCreateType("定制单")}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              + 新建定制单
            </button>
            <button
              onClick={() => setCreateType("批发单")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors"
            >
              + 新建批发单
            </button>
          </>
        }
      />

      <StatStrip
        items={[
          { label: "全部订单", value: String(summary.total) },
          { label: "定制单", value: String(summary.custom), accent: "text-blue-600" },
          { label: "批发单", value: String(summary.wholesale), accent: "text-indigo-600" },
          { label: "已收款", value: formatMoney(summary.amountPaid), accent: "text-green-600" },
          { label: "未收款", value: formatMoney(summary.balance), accent: "text-red-600" },
        ]}
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="relative min-w-[180px] flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索订单号 / 客户名称…"
            className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">类别</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
          >
            <option>全部</option>
            <option>定制单</option>
            <option>批发单</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">状态</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
          >
            <option>全部</option>
            <option>下单</option>
            <option>未付清</option>
            <option>结清</option>
            <option>已关闭</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">日期</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
          >
            <option>全部</option>
            <option>今天</option>
            <option>本周</option>
            <option>本月</option>
          </select>
        </div>
        <button
          onClick={() => {
            setTypeFilter("全部");
            setStatusFilter("全部");
            setDateFilter("全部");
          }}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-400 hover:border-red-300 hover:text-red-500 transition-colors"
        >
          ✕ 重置
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-9 px-3 py-2.5">
                <input type="checkbox" disabled className="cursor-not-allowed opacity-40" />
              </th>
              {ORDER_COLS.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order: BizOrder) => (
                <tr
                  key={order.order_number}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-3 py-2.5 align-top">
                    <input type="checkbox" disabled className="cursor-not-allowed opacity-40" />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-700">
                    {order.order_number}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        order.order_type === "定制单"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {order.order_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{order.client_name}</td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-500">
                    {order.description || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{formatMoney(order.total_price || 0)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{order.order_date || "-"}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={order.status ?? "下单"} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-red-600">
                    {formatMoney(order.balance || 0)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                      >
                        查看
                      </button>
                      {deleteConfirm === order.order_number ? (
                        <>
                          <button
                            onClick={() => handleDelete(order.order_number)}
                            className="rounded border border-red-400 bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-300 transition-colors"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(order.order_number)}
                          className="rounded border border-red-100 px-2 py-0.5 text-xs text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={ORDER_COLS.length + 1}
                  className="py-10 text-center text-sm text-slate-400"
                >
                  当前没有可显示的订单数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Finance ─────────────────────────────────────────────────────────────────

type FinanceSub = "income" | "expense" | "cash" | "ledger" | "receivables";

type FinanceDraft = {
  target: string;
  detail: string;
  amount: string;
  expense_type: string;
  payment_method: string;
  expense_date: string;
  remark: string;
};

const FINANCE_SUBS: Array<{ key: FinanceSub; label: string }> = [
  { key: "income", label: "订单收入" },
  { key: "expense", label: "支出清单" },
  { key: "cash", label: "现金管理" },
  { key: "ledger", label: "月度账单" },
  { key: "receivables", label: "应收款" },
];

function SmallInput({ value, onChange, placeholder, type = "text" }: { value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none" />;
}

function SmallSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[]; }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none">
      {options.map((option) => <option key={option} value={option}>{option || "未选择"}</option>)}
    </select>
  );
}

function PanelCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode; }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 border-b border-slate-100 pb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {note && <p className="mt-1 text-[11px] text-slate-500">{note}</p>}
      </div>
      {children}
    </div>
  );
}

function FinanceSection({ orders, expenses, setExpenses, cashEntries, setCashEntries, payrolls }: {
  orders: BizOrder[];
  expenses: ExpenseRecord[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  cashEntries: CashEntry[];
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  payrolls: PayrollRecord[];
}) {
  function exportFinance() {
    if (sub === "income") {
      downloadMappedCsv(`biz-finance-income-${todayIso()}.csv`, ["订单号", "客户", "金额", "支付方式", "日期", "明细", "类型"], paymentRows, ({ order, record }) => [order.order_number, order.client_name, record.amount, record.method, record.date, record.note ?? "", record.type === "refund" ? "退款" : "收款"]);
      return;
    }
    if (sub === "expense") {
      downloadMappedCsv(`biz-finance-expense-${todayIso()}.csv`, ["对象", "明细", "金额", "类型", "付款方式", "日期", "备注"], expenses, (item) => [item.target, item.detail, item.amount, item.expense_type, item.payment_method, item.expense_date, item.remark ?? ""]);
      return;
    }
    if (sub === "cash") {
      downloadMappedCsv(`biz-finance-cash-${todayIso()}.csv`, ["类型", "金额", "日期", "备注"], cashEntries, (item) => [item.type, item.amount, item.date, item.note ?? ""]);
      return;
    }
    if (sub === "ledger") {
      downloadMappedCsv(`biz-finance-ledger-${todayIso()}.csv`, ["月份", "收入", "支出", "净额", "工资", "净利润"], ledgerRows, (item) => [item.month, item.income, item.expense, item.net, item.wage, item.profit]);
      return;
    }
    downloadMappedCsv(`biz-finance-receivables-${todayIso()}.csv`, ["客户", "订单号", "总额", "已付", "余款", "下单日期", "状态"], receivableOrders, (o) => [o.client_name, o.order_number, o.total_after_tax ?? o.total_price ?? 0, o.amount_paid ?? 0, o.balance ?? 0, o.order_date ?? "", o.status ?? ""]);
  }
  function printFinance() {
    if (sub === "income") {
      openPrintWindow(buildSimpleTablePrintHTML("订单收入", `共 ${paymentRows.length} 条`, ["订单号", "客户", "金额", "支付方式", "日期", "明细", "类型"], paymentRows.map(({ order, record }) => [order.order_number, order.client_name, formatMoney(record.amount), record.method, record.date, record.note ?? "-", record.type === "refund" ? "退款" : "收款"])));
      return;
    }
    if (sub === "expense") {
      openPrintWindow(buildSimpleTablePrintHTML("支出清单", `共 ${expenses.length} 条`, ["对象", "明细", "金额", "类型", "付款方式", "日期", "备注"], expenses.map((item) => [item.target, item.detail, formatMoney(item.amount), item.expense_type, item.payment_method, item.expense_date, item.remark ?? "-"])));
      return;
    }
    if (sub === "cash") {
      openPrintWindow(buildSimpleTablePrintHTML("现金管理", `共 ${cashEntries.length} 条`, ["类型", "金额", "日期", "备注"], cashEntries.map((item) => [item.type, formatMoney(item.amount), item.date, item.note ?? "-"])));
      return;
    }
    if (sub === "ledger") {
      openPrintWindow(buildSimpleTablePrintHTML("月度账单", `共 ${ledgerRows.length} 条`, ["月份", "收入", "支出", "净额", "工资", "净利润"], ledgerRows.map((item) => [item.month, formatMoney(item.income), formatMoney(item.expense), formatMoney(item.net), formatMoney(item.wage), formatMoney(item.profit)])));
      return;
    }
    openPrintWindow(buildSimpleTablePrintHTML("应收款", `共 ${receivableOrders.length} 条`, ["客户", "订单号", "总额", "已付", "余款", "下单日期", "状态"], receivableOrders.map((o) => [o.client_name, o.order_number, formatMoney(o.total_after_tax ?? o.total_price ?? 0), formatMoney(o.amount_paid ?? 0), formatMoney(o.balance ?? 0), o.order_date ?? "-", o.status ?? "-"])));
  }
  const [sub, setSub] = useState<FinanceSub>("income");
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<FinanceDraft>({ target: "", detail: "", amount: "", expense_type: "采购", payment_method: "转账", expense_date: today, remark: "" });
  const paymentRows = orders.flatMap((order) => (order.payment_history ?? []).map((record, index) => ({ order, record, key: `${order.order_number}-${index}` })));
  const totalIncome = orders.reduce((s, o) => s + (o.amount_paid ?? 0), 0);
  const totalExpense = expenses.reduce((s, item) => s + item.amount, 0);
  const totalBalance = orders.reduce((s, o) => s + (o.balance ?? 0), 0);
  const payrollAmount = payrolls.reduce((s, item) => s + item.net_salary, 0);
  const cashBalance = cashEntries.reduce((s, item) => s + (item.type === "收入" ? item.amount : -item.amount), 0);
  const receivableOrders = orders.filter((o) => (o.balance ?? 0) > 0 && o.status !== "已关闭");
  const ledgerRows = Array.from(new Set([...orders.map((o) => (o.order_date ?? "").slice(0, 7)), ...expenses.map((e) => e.expense_date.slice(0, 7)), ...payrolls.map((p) => p.month)])).filter(Boolean).sort().reverse().map((month) => {
    const income = orders.filter((o) => (o.order_date ?? "").startsWith(month)).reduce((sum, item) => sum + (item.amount_paid ?? 0), 0);
    const expense = expenses.filter((item) => item.expense_date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
    const wage = payrolls.filter((item) => item.month === month).reduce((sum, item) => sum + item.net_salary, 0);
    return { month, income, expense, net: income - expense, wage, profit: income - expense - wage };
  });

  function addExpense() {
    const amount = Number(draft.amount) || 0;
    if (!draft.target.trim() || !draft.detail.trim() || amount <= 0) return;
    const record: ExpenseRecord = { id: `EXP-${new Date().getFullYear()}-${String(expenses.length + 1).padStart(3, "0")}`, target: draft.target.trim(), detail: draft.detail.trim(), amount, expense_type: draft.expense_type, payment_method: draft.payment_method, expense_date: draft.expense_date, remark: draft.remark || undefined };
    setExpenses((prev) => [record, ...prev]);
    if (draft.payment_method === "现金") {
      setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: "支出", amount, date: draft.expense_date, note: `${record.target} · ${record.detail}` }, ...prev]);
    }
    setDraft({ target: "", detail: "", amount: "", expense_type: "采购", payment_method: "转账", expense_date: today, remark: "" });
  }

  return (
    <div>
      <SectionHeader eyebrow="Finance Management" title="收支管理" actions={<><ActionBtn onClick={exportFinance}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printFinance}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={addExpense}>+ 录入支出</ActionBtn></>} />
      <StatStrip items={[{ label: "订单收入", value: formatMoney(totalIncome), accent: "text-green-600" }, { label: "支出合计", value: formatMoney(totalExpense), accent: "text-red-600" }, { label: "现金余额", value: formatMoney(cashBalance), accent: "text-sky-600" }, { label: "应收余款", value: formatMoney(totalBalance), accent: "text-amber-600" }, { label: "账面利润", value: formatMoney(totalIncome - totalExpense - payrollAmount), accent: "text-emerald-600" }]} />
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.1fr_2fr]">
        <PanelCard title="新增支出" note="现金付款会自动补一条现金流水。">
          <div className="grid gap-2 sm:grid-cols-2">
            <SmallInput value={draft.target} onChange={(v) => setDraft((d) => ({ ...d, target: v }))} placeholder="对象 / 供应商" />
            <SmallInput value={draft.detail} onChange={(v) => setDraft((d) => ({ ...d, detail: v }))} placeholder="支出明细" />
            <SmallInput value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" />
            <SmallSelect value={draft.expense_type} onChange={(v) => setDraft((d) => ({ ...d, expense_type: v }))} options={["采购", "工资", "物流", "办公", "其他"]} />
            <SmallSelect value={draft.payment_method} onChange={(v) => setDraft((d) => ({ ...d, payment_method: v }))} options={["现金", "转账", "刷卡", "支票"]} />
            <SmallInput value={draft.expense_date} onChange={(v) => setDraft((d) => ({ ...d, expense_date: v }))} type="date" />
          </div>
          <div className="mt-2"><SmallInput value={draft.remark} onChange={(v) => setDraft((d) => ({ ...d, remark: v }))} placeholder="备注（可选）" /></div>
        </PanelCard>
        <div className="mb-4 flex flex-wrap border-b-2 border-slate-200 bg-white self-start">
          {FINANCE_SUBS.map((t) => <button key={t.key} onClick={() => setSub(t.key)} className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${sub === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>)}
        </div>
      </div>
      {sub === "income" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">订单号</th><th className="px-4 py-2.5 font-semibold text-slate-600">客户</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">支付方式</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">明细</th></tr></thead><tbody>{paymentRows.map(({ key, order, record }) => <tr key={key} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{order.order_number}</td><td className="px-4 py-2.5 text-slate-700">{order.client_name}</td><td className={`px-4 py-2.5 font-semibold ${record.type === "refund" ? "text-rose-600" : "text-green-600"}`}>{record.type === "refund" ? "-" : "+"}{formatMoney(record.amount)}</td><td className="px-4 py-2.5 text-slate-600">{record.method}</td><td className="px-4 py-2.5 text-slate-500">{record.date}</td><td className="px-4 py-2.5 text-slate-500">{record.note ?? "-"}</td></tr>)}</tbody></table></div>}
      {sub === "expense" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">对象</th><th className="px-4 py-2.5 font-semibold text-slate-600">明细</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">类型</th><th className="px-4 py-2.5 font-semibold text-slate-600">形式</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 text-slate-700">{item.target}</td><td className="px-4 py-2.5 text-slate-500">{item.detail}</td><td className="px-4 py-2.5 font-semibold text-rose-600">{formatMoney(item.amount)}</td><td className="px-4 py-2.5 text-slate-600">{item.expense_type}</td><td className="px-4 py-2.5 text-slate-600">{item.payment_method}</td><td className="px-4 py-2.5 text-slate-500">{item.expense_date}</td></tr>)}</tbody></table></div>}
      {sub === "cash" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">类型</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">备注</th></tr></thead><tbody>{cashEntries.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.type === "收入" ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"}`}>{item.type}</span></td><td className={`px-4 py-2.5 font-semibold ${item.type === "收入" ? "text-green-600" : "text-rose-600"}`}>{formatMoney(item.amount)}</td><td className="px-4 py-2.5 text-slate-500">{item.date}</td><td className="px-4 py-2.5 text-slate-500">{item.note ?? "-"}</td></tr>)}</tbody></table></div>}
      {sub === "ledger" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">月份</th><th className="px-4 py-2.5 font-semibold text-slate-600">收入</th><th className="px-4 py-2.5 font-semibold text-slate-600">支出</th><th className="px-4 py-2.5 font-semibold text-slate-600">净额</th><th className="px-4 py-2.5 font-semibold text-slate-600">工资</th><th className="px-4 py-2.5 font-semibold text-slate-600">净利润</th></tr></thead><tbody>{ledgerRows.map((item) => <tr key={item.month} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.month}</td><td className="px-4 py-2.5 text-green-600">{formatMoney(item.income)}</td><td className="px-4 py-2.5 text-rose-600">{formatMoney(item.expense)}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.net)}</td><td className="px-4 py-2.5 text-amber-600">{formatMoney(item.wage)}</td><td className={`px-4 py-2.5 font-semibold ${item.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatMoney(item.profit)}</td></tr>)}</tbody></table></div>}
      {sub === "receivables" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">客户</th><th className="px-4 py-2.5 font-semibold text-slate-600">订单号</th><th className="px-4 py-2.5 font-semibold text-slate-600">总额</th><th className="px-4 py-2.5 font-semibold text-slate-600">已付</th><th className="px-4 py-2.5 font-semibold text-slate-600">余款</th><th className="px-4 py-2.5 font-semibold text-slate-600">下单日期</th></tr></thead><tbody>{receivableOrders.map((o) => <tr key={o.order_number} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 text-slate-700">{o.client_name}</td><td className="px-4 py-2.5 font-medium text-slate-700">{o.order_number}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(o.total_after_tax ?? o.total_price ?? 0)}</td><td className="px-4 py-2.5 font-medium text-green-600">{formatMoney(o.amount_paid ?? 0)}</td><td className="px-4 py-2.5 font-semibold text-red-600">{formatMoney(o.balance ?? 0)}</td><td className="px-4 py-2.5 text-slate-500">{o.order_date || "-"}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

type ContactSub = "clients" | "suppliers";

function ClientsSection({ clients, setClients, suppliers, setSuppliers, orders, appointments, quotes, setAppointments, setQuotes }: { clients: ContactRecord[]; setClients: React.Dispatch<React.SetStateAction<ContactRecord[]>>; suppliers: SupplierRecord[]; setSuppliers: React.Dispatch<React.SetStateAction<SupplierRecord[]>>; orders: BizOrder[]; appointments: MeasurementAppointmentRecord[]; quotes: QuoteRecord[]; setAppointments: React.Dispatch<React.SetStateAction<MeasurementAppointmentRecord[]>>; setQuotes: React.Dispatch<React.SetStateAction<QuoteRecord[]>>; }) {
  const [sub, setSub] = useState<ContactSub>("clients");
  const today = new Date().toISOString().slice(0, 10);
  const [clientDraft, setClientDraft] = useState({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
  const [supplierDraft, setSupplierDraft] = useState({ name: "", category: "Fabric", contact_person: "", phone: "", address: "", remark: "" });
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? "");

  function exportContacts() {
    if (sub === "clients") {
      downloadMappedCsv(`biz-clients-${todayIso()}.csv`, ["Client Name", "Contact", "Phone", "Email/WeChat", "Address", "Created At", "Note", "VIP", "Balance"], clients, (item) => [item.name, item.contact ?? "", item.phone ?? "", item.email ?? item.wechat ?? "", item.address ?? "", item.created_at ?? "", item.note ?? "", item.is_vip ? "Yes" : "No", item.balance ?? 0]);
      return;
    }
    downloadMappedCsv(`biz-suppliers-${todayIso()}.csv`, ["Supplier Name", "Category", "Contact", "Phone", "Address", "Last Purchase", "Remark"], suppliers, (item) => [item.name, item.category ?? "", item.contact_person ?? "", item.phone ?? "", item.address ?? "", item.last_purchase_date ?? "", item.remark ?? ""]);
  }

  function printContacts() {
    if (sub === "clients") {
      openPrintWindow(buildSimpleTablePrintHTML("Client Directory", `Total ${clients.length}`, ["Client Name", "Contact", "Phone", "Email/WeChat", "Address", "Created At", "Note"], clients.map((item) => [item.name, item.contact ?? "-", item.phone ?? "-", item.email ?? item.wechat ?? "-", item.address ?? "-", item.created_at ?? "-", item.note ?? "-"])));
      return;
    }
    openPrintWindow(buildSimpleTablePrintHTML("Supplier Directory", `Total ${suppliers.length}`, ["Supplier Name", "Category", "Contact", "Phone", "Address", "Last Purchase", "Remark"], suppliers.map((item) => [item.name, item.category ?? "-", item.contact_person ?? "-", item.phone ?? "-", item.address ?? "-", item.last_purchase_date ?? "-", item.remark ?? "-"])));
  }

  function addClient() {
    if (!clientDraft.name.trim()) return;
    const newId = `CL-${String(clients.length + 1).padStart(3, "0")}`;
    setClients((prev) => [{ id: newId, name: clientDraft.name.trim(), contact: clientDraft.contact || undefined, phone: clientDraft.phone || undefined, wechat: clientDraft.wechat || undefined, address: clientDraft.address || undefined, note: clientDraft.note || undefined, created_at: today, balance: 0, is_vip: false }, ...prev]);
    setSelectedClientId(newId);
    setClientDraft({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
  }

  function addSupplier() {
    if (!supplierDraft.name.trim()) return;
    setSuppliers((prev) => [{ id: `SUP-${String(prev.length + 1).padStart(3, "0")}`, name: supplierDraft.name.trim(), category: supplierDraft.category, contact_person: supplierDraft.contact_person || undefined, phone: supplierDraft.phone || undefined, address: supplierDraft.address || undefined, remark: supplierDraft.remark || undefined, last_purchase_date: today }, ...prev]);
    setSupplierDraft({ name: "", category: "Fabric", contact_person: "", phone: "", address: "", remark: "" });
  }

  const filteredClients = clients.filter((item) => {
    const keyword = clientSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [item.name, item.contact, item.phone, item.email, item.wechat, item.address, item.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  const selectedClient = filteredClients.find((item) => item.id === selectedClientId) ?? clients.find((item) => item.id === selectedClientId) ?? filteredClients[0] ?? clients[0] ?? null;
  const selectedClientOrders = selectedClient
    ? [...orders].filter((item) => item.client_name === selectedClient.name).sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")))
    : [];
  const selectedClientAppointments = selectedClient
    ? [...appointments].filter((item) => item.client_id === selectedClient.id || item.client_name === selectedClient.name).sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)))
    : [];
  const selectedClientQuotes = selectedClient
    ? [...quotes].filter((item) => item.client_name === selectedClient.name).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    : [];
  const clientTotal = selectedClientOrders.reduce((sum, item) => sum + (item.total_after_tax ?? item.total_price ?? 0), 0);
  const clientPaid = selectedClientOrders.reduce((sum, item) => sum + (item.amount_paid ?? 0), 0);
  const clientBalance = selectedClientOrders.reduce((sum, item) => sum + (item.balance ?? 0), 0);
  const clientCustomOrderCount = selectedClientOrders.filter((item) => item.order_type !== "\u6279\u53d1\u5355").length;
  const clientWholesaleOrderCount = selectedClientOrders.filter((item) => item.order_type === "\u6279\u53d1\u5355").length;
  const clientLastOrder = selectedClientOrders[0]?.order_date ?? "-";
  const nextAppointment = [...selectedClientAppointments].filter((item) => getAppointmentStatus(item.appointment_date) !== "\u5df2\u5b8c\u6210").sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)))[0];

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
  }

  function toggleVip(clientId: string) {
    setClients((prev) => prev.map((item) => item.id === clientId ? { ...item, is_vip: !item.is_vip } : item));
  }

  function createClientAppointment(client: ContactRecord) {
    setAppointments((prev) => [{
      id: `APT-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`,
      client_id: client.id,
      client_name: client.name,
      phone: client.phone || undefined,
      address: client.address || undefined,
      appointment_date: `${today}T10:00`,
      description: "Created from client center",
    }, ...prev]);
  }

  function createClientQuote(client: ContactRecord) {
    setQuotes((prev) => [{
      id: `QT-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`,
      client_name: client.name,
      title: "Client center quick quote",
      amount: 0,
      created_at: today,
      valid_until: addDaysIso(today, 7),
      status: "\u8349\u7a3f",
    }, ...prev]);
  }

  useEffect(() => {
    if (sub !== "clients") return;
    if (!selectedClientId && filteredClients[0]?.id) setSelectedClientId(filteredClients[0].id);
    if (selectedClientId && !clients.some((item) => item.id === selectedClientId)) setSelectedClientId(filteredClients[0]?.id ?? clients[0]?.id ?? "");
  }, [sub, selectedClientId, filteredClients, clients]);

  return <div><SectionHeader eyebrow="Contacts" title="Clients & Suppliers" actions={<><ActionBtn onClick={exportContacts}>Export current</ActionBtn><ActionBtn onClick={printContacts}>Print current</ActionBtn><ActionBtn tone="primary" onClick={sub === "clients" ? addClient : addSupplier}>+ New {sub === "clients" ? "client" : "supplier"}</ActionBtn></>} /><StatStrip items={[{ label: "Clients", value: String(clients.length) }, { label: "VIP clients", value: String(clients.filter((item) => item.is_vip).length), accent: "text-sky-600" }, { label: "Suppliers", value: String(suppliers.length) }, { label: "Clients with balance", value: String(clients.filter((item) => (item.balance ?? 0) > 0).length), accent: "text-amber-600" }]} /><SegmentedControl options={[{ key: "clients", label: "Client directory" }, { key: "suppliers", label: "Suppliers" }]} value={sub} onChange={setSub} />{sub === "clients" ? <div className="space-y-4"><PanelCard title="Quick add client"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><SmallInput value={clientDraft.name} onChange={(v) => setClientDraft((d) => ({ ...d, name: v }))} placeholder="Client name" /><SmallInput value={clientDraft.contact} onChange={(v) => setClientDraft((d) => ({ ...d, contact: v }))} placeholder="Contact" /><SmallInput value={clientDraft.phone} onChange={(v) => setClientDraft((d) => ({ ...d, phone: v }))} placeholder="Phone" /><SmallInput value={clientDraft.wechat} onChange={(v) => setClientDraft((d) => ({ ...d, wechat: v }))} placeholder="WeChat / Email" /><SmallInput value={clientDraft.address} onChange={(v) => setClientDraft((d) => ({ ...d, address: v }))} placeholder="Address" /><SmallInput value={clientDraft.note} onChange={(v) => setClientDraft((d) => ({ ...d, note: v }))} placeholder="Note" /></div></PanelCard><div className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]"><PanelCard title="Client list" note="Imported from the Base44 client row idea, but adapted to the current site as a left list plus linked detail workspace."><div className="space-y-3"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">?</span><input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search client / phone / address" className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">{filteredClients.length ? filteredClients.map((item) => { const itemOrders = orders.filter((order) => order.client_name === item.name); const itemBalance = itemOrders.reduce((sum, order) => sum + (order.balance ?? 0), 0); const isActive = selectedClient?.id === item.id; return <button key={item.id} onClick={() => selectClient(item.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${isActive ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{item.name}</span>{item.is_vip ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">VIP</span> : null}</div><p className="mt-1 text-[11px] text-slate-500">{item.phone ?? item.contact ?? "No contact yet"}</p></div><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${itemBalance > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{itemBalance > 0 ? `Balance ${formatMoney(itemBalance)}` : "Clear"}</span></div><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500"><span>{itemOrders.length} orders</span><span>{appointments.filter((entry) => entry.client_id === item.id || entry.client_name === item.name).length} appointments</span><span>{quotes.filter((entry) => entry.client_name === item.name).length} quotes</span></div></button>; }) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">No matching clients</div>}</div></div></PanelCard><PanelCard title={selectedClient ? `Client detail ? ${selectedClient.name}` : "Client detail"} note="This lands the missing client detail linkage and client order panel directly inside the current site architecture.">{selectedClient ? <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><div className="flex items-center gap-2"><h3 className="text-base font-semibold text-slate-900">{selectedClient.name}</h3>{selectedClient.is_vip ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">VIP client</span> : null}</div><p className="mt-1 text-xs text-slate-500">Contact {selectedClient.contact ?? "-"}, phone {selectedClient.phone ?? "-"}</p><p className="mt-1 text-xs text-slate-500">Address {selectedClient.address ?? "Not filled"}</p><p className="mt-1 text-xs text-slate-500">WeChat/email {selectedClient.wechat ?? selectedClient.email ?? "Not filled"}</p></div><div className="flex flex-wrap gap-2"><ActionBtn onClick={() => toggleVip(selectedClient.id)}>{selectedClient.is_vip ? "Remove VIP" : "Set VIP"}</ActionBtn><ActionBtn onClick={() => createClientAppointment(selectedClient)}>+ Quick appointment</ActionBtn><ActionBtn onClick={() => createClientQuote(selectedClient)}>+ Quick quote</ActionBtn></div></div><StatStrip items={[{ label: "Orders", value: String(selectedClientOrders.length) }, { label: "Custom / wholesale", value: `${clientCustomOrderCount} / ${clientWholesaleOrderCount}` }, { label: "Gross value", value: formatMoney(clientTotal), accent: "text-slate-800" }, { label: "Paid / balance", value: `${formatMoney(clientPaid)} / ${formatMoney(clientBalance)}`, accent: clientBalance > 0 ? "text-amber-600" : "text-emerald-600" }]} /><div className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Account status</p><div className="mt-3 space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-slate-500">Last order</span><span className="font-medium text-slate-900">{clientLastOrder}</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Next appointment</span><span className="font-medium text-slate-900">{nextAppointment ? formatAppointmentDate(nextAppointment.appointment_date) : "None"}</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Latest quote</span><span className="font-medium text-slate-900">{selectedClientQuotes[0]?.status ?? "None"}</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Notes</span><span className="max-w-[180px] text-right text-slate-900">{selectedClient.note ?? "-"}</span></div></div></div><div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Linked orders</p><span className="text-[11px] text-slate-400">Balance and status stay in sync</span></div>{selectedClientOrders.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-3 py-2 font-semibold text-slate-600">Order</th><th className="px-3 py-2 font-semibold text-slate-600">Type</th><th className="px-3 py-2 font-semibold text-slate-600">Date</th><th className="px-3 py-2 font-semibold text-slate-600">Gross</th><th className="px-3 py-2 font-semibold text-slate-600">Paid</th><th className="px-3 py-2 font-semibold text-slate-600">Balance</th><th className="px-3 py-2 font-semibold text-slate-600">Status</th></tr></thead><tbody>{selectedClientOrders.slice(0, 8).map((item) => <tr key={item.order_number} className="border-b border-slate-100 last:border-b-0"><td className="px-3 py-2 font-medium text-slate-700">{item.order_number}</td><td className="px-3 py-2 text-slate-600">{item.order_type}</td><td className="px-3 py-2 text-slate-500">{item.order_date ?? "-"}</td><td className="px-3 py-2 text-slate-700">{formatMoney(item.total_after_tax ?? item.total_price ?? 0)}</td><td className="px-3 py-2 text-emerald-600">{formatMoney(item.amount_paid ?? 0)}</td><td className={`px-3 py-2 font-semibold ${(item.balance ?? 0) > 0 ? "text-amber-600" : "text-slate-700"}`}>{formatMoney(item.balance ?? 0)}</td><td className="px-3 py-2 text-slate-600">{item.status ?? "-"}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">This client has no linked orders yet</div>}</div></div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Appointments</p><span className="text-[11px] text-slate-400">Linked from client detail</span></div>{selectedClientAppointments.length ? <div className="space-y-2">{selectedClientAppointments.slice(0, 5).map((item) => { const status = getAppointmentStatus(item.appointment_date); return <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-800">{formatAppointmentDate(item.appointment_date)}</span><AppointmentStatusBadge status={status} /></div><p className="mt-1 text-[11px] text-slate-500">{item.address ?? "No address"}</p><p className="mt-1 text-[11px] text-slate-400">{item.description ?? "No note"}</p></div>; })}</div> : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">No appointments yet</div>}</div><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Quotes</p><span className="text-[11px] text-slate-400">Client quote panel</span></div>{selectedClientQuotes.length ? <div className="space-y-2">{selectedClientQuotes.slice(0, 5).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-800">{item.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.status}</span></div><div className="mt-1 flex items-center justify-between text-[11px] text-slate-500"><span>{item.created_at}</span><span className="font-semibold text-slate-800">{formatMoney(item.amount)}</span></div><p className="mt-1 text-[11px] text-slate-400">Valid until {item.valid_until}</p></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">No quotes yet</div>}</div></div></div> : <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">Select a client on the left to view linked details</div>}</PanelCard></div></div> : <div className="space-y-4"><PanelCard title="Quick add supplier"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><SmallInput value={supplierDraft.name} onChange={(v) => setSupplierDraft((d) => ({ ...d, name: v }))} placeholder="Supplier name" /><SmallSelect value={supplierDraft.category} onChange={(v) => setSupplierDraft((d) => ({ ...d, category: v }))} options={["Fabric", "Hardware", "Glass", "Logistics", "Other"]} /><SmallInput value={supplierDraft.contact_person} onChange={(v) => setSupplierDraft((d) => ({ ...d, contact_person: v }))} placeholder="Contact" /><SmallInput value={supplierDraft.phone} onChange={(v) => setSupplierDraft((d) => ({ ...d, phone: v }))} placeholder="Phone" /><SmallInput value={supplierDraft.address} onChange={(v) => setSupplierDraft((d) => ({ ...d, address: v }))} placeholder="Address" /><SmallInput value={supplierDraft.remark} onChange={(v) => setSupplierDraft((d) => ({ ...d, remark: v }))} placeholder="Remark" /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">Supplier name</th><th className="px-4 py-2.5 font-semibold text-slate-600">Category</th><th className="px-4 py-2.5 font-semibold text-slate-600">Contact</th><th className="px-4 py-2.5 font-semibold text-slate-600">Phone</th><th className="px-4 py-2.5 font-semibold text-slate-600">Address</th><th className="px-4 py-2.5 font-semibold text-slate-600">Last purchase</th><th className="px-4 py-2.5 font-semibold text-slate-600">Remark</th></tr></thead><tbody>{suppliers.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.name}</td><td className="px-4 py-2.5 text-slate-600">{item.category ?? "-"}</td><td className="px-4 py-2.5 text-slate-600">{item.contact_person ?? "-"}</td><td className="px-4 py-2.5 text-slate-600">{item.phone ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.address ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.last_purchase_date ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.remark ?? "-"}</td></tr>)}</tbody></table></div></div>}</div>;
}

type MaterialSub = "inventory" | "purchases";

function MaterialsSection({ materials, setMaterials, purchases, setPurchases, suppliers }: { materials: MaterialRecord[]; setMaterials: React.Dispatch<React.SetStateAction<MaterialRecord[]>>; purchases: PurchaseRecord[]; setPurchases: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>; suppliers: SupplierRecord[]; }) {
  const [sub, setSub] = useState<MaterialSub>("inventory");
  const today = new Date().toISOString().slice(0, 10);
  const [materialDraft, setMaterialDraft] = useState({ code: "", name: "", specification: "", unit: "个", stock_quantity: "", min_stock: "", purchase_price: "", supplier: suppliers[0]?.name ?? "", remark: "" });
  const [purchaseDraft, setPurchaseDraft] = useState({ supplier: suppliers[0]?.name ?? "", item_name: "", quantity: "", unit: "个", unit_price: "", purchase_date: today, status: "未付款" });
  const lowStockCount = materials.filter((item) => item.stock_quantity <= item.min_stock).length;
  const monthlyPurchase = purchases.filter((item) => item.purchase_date.startsWith(today.slice(0, 7))).reduce((sum, item) => sum + item.total_amount, 0);
  function exportMaterials() { if (sub === "inventory") { downloadMappedCsv(`biz-materials-${todayIso()}.csv`, ["编码", "名称", "规格", "单位", "库存", "预警库存", "成本单价", "供应商", "最近入库日期", "备注"], materials, (item) => [item.code, item.name, item.specification ?? "", item.unit, item.stock_quantity, item.min_stock, item.purchase_price, item.supplier ?? "", item.last_stock_date ?? "", item.remark ?? ""]); return; } downloadMappedCsv(`biz-purchases-${todayIso()}.csv`, ["采购单号", "供应商", "品名", "数量", "单位", "单价", "总价", "采购日期", "状态"], purchases, (item) => [item.id, item.supplier, item.item_name, item.quantity, item.unit, item.unit_price, item.total_amount, item.purchase_date, item.status]); }
  function printMaterials() { if (sub === "inventory") { openPrintWindow(buildSimpleTablePrintHTML("库存清单", `共 ${materials.length} 条`, ["编码", "名称", "规格", "单位", "库存", "预警库存", "成本单价", "供应商"], materials.map((item) => [item.code, item.name, item.specification ?? "-", item.unit, item.stock_quantity, item.min_stock, formatMoney(item.purchase_price), item.supplier ?? "-"]))); return; } openPrintWindow(buildSimpleTablePrintHTML("采购记录", `共 ${purchases.length} 条`, ["采购单号", "供应商", "品名", "数量", "单价", "总价", "采购日期", "状态"], purchases.map((item) => [item.id, item.supplier, item.item_name, `${item.quantity} ${item.unit}`, formatMoney(item.unit_price), formatMoney(item.total_amount), item.purchase_date, item.status]))); }
  function addMaterial() { if (!materialDraft.name.trim() || !materialDraft.code.trim()) return; setMaterials((prev) => [{ id: `MAT-${String(prev.length + 1).padStart(3, "0")}`, code: materialDraft.code.trim(), name: materialDraft.name.trim(), specification: materialDraft.specification || undefined, unit: materialDraft.unit, stock_quantity: Number(materialDraft.stock_quantity) || 0, min_stock: Number(materialDraft.min_stock) || 0, purchase_price: Number(materialDraft.purchase_price) || 0, supplier: materialDraft.supplier || undefined, last_stock_date: today, remark: materialDraft.remark || undefined }, ...prev]); setMaterialDraft({ code: "", name: "", specification: "", unit: "个", stock_quantity: "", min_stock: "", purchase_price: "", supplier: suppliers[0]?.name ?? "", remark: "" }); }
  function addPurchase() { const quantity = Number(purchaseDraft.quantity) || 0; const unitPrice = Number(purchaseDraft.unit_price) || 0; if (!purchaseDraft.item_name.trim() || quantity <= 0) return; setPurchases((prev) => [{ id: `PO-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, supplier: purchaseDraft.supplier || "未指定", item_name: purchaseDraft.item_name.trim(), quantity, unit: purchaseDraft.unit, unit_price: unitPrice, total_amount: quantity * unitPrice, purchase_date: purchaseDraft.purchase_date, status: purchaseDraft.status }, ...prev]); setPurchaseDraft({ supplier: suppliers[0]?.name ?? "", item_name: "", quantity: "", unit: "个", unit_price: "", purchase_date: today, status: "未付款" }); }
  return <div><SectionHeader eyebrow="Materials & Inventory" title="物料库存" actions={<><ActionBtn onClick={exportMaterials}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printMaterials}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={sub === "inventory" ? addMaterial : addPurchase}>+ {sub === "inventory" ? "新建物料" : "新建采购单"}</ActionBtn></>} /><StatStrip items={[{ label: "物料品类", value: String(materials.length) }, { label: "低库存预警", value: String(lowStockCount), accent: "text-orange-600" }, { label: "本月采购额", value: formatMoney(monthlyPurchase), accent: "text-red-600" }]} /><SegmentedControl options={[{ key: "inventory", label: "库存清单" }, { key: "purchases", label: "采购记录" }]} value={sub} onChange={setSub} />{sub === "inventory" ? <div className="space-y-4"><PanelCard title="快速录入物料"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><SmallInput value={materialDraft.code} onChange={(v) => setMaterialDraft((d) => ({ ...d, code: v }))} placeholder="编码" /><SmallInput value={materialDraft.name} onChange={(v) => setMaterialDraft((d) => ({ ...d, name: v }))} placeholder="名称" /><SmallInput value={materialDraft.specification} onChange={(v) => setMaterialDraft((d) => ({ ...d, specification: v }))} placeholder="规格" /><SmallSelect value={materialDraft.unit} onChange={(v) => setMaterialDraft((d) => ({ ...d, unit: v }))} options={["个", "米", "根", "套", "张"]} /><SmallInput value={materialDraft.stock_quantity} onChange={(v) => setMaterialDraft((d) => ({ ...d, stock_quantity: v }))} type="number" placeholder="库存" /><SmallInput value={materialDraft.min_stock} onChange={(v) => setMaterialDraft((d) => ({ ...d, min_stock: v }))} type="number" placeholder="预警库存" /><SmallInput value={materialDraft.purchase_price} onChange={(v) => setMaterialDraft((d) => ({ ...d, purchase_price: v }))} type="number" placeholder="成本单价" /><SmallSelect value={materialDraft.supplier} onChange={(v) => setMaterialDraft((d) => ({ ...d, supplier: v }))} options={suppliers.length ? suppliers.map((item) => item.name) : ["未指定"]} /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">品名</th><th className="px-4 py-2.5 font-semibold text-slate-600">规格 / 型号</th><th className="px-4 py-2.5 font-semibold text-slate-600">单位</th><th className="px-4 py-2.5 font-semibold text-slate-600">当前库存</th><th className="px-4 py-2.5 font-semibold text-slate-600">预警库存</th><th className="px-4 py-2.5 font-semibold text-slate-600">成本单价</th><th className="px-4 py-2.5 font-semibold text-slate-600">最近入库日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">备注</th></tr></thead><tbody>{materials.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.name}<div className="text-[11px] text-slate-400">{item.code}</div></td><td className="px-4 py-2.5 text-slate-600">{item.specification ?? "-"}</td><td className="px-4 py-2.5 text-slate-600">{item.unit}</td><td className={`px-4 py-2.5 font-semibold ${item.stock_quantity <= item.min_stock ? "text-orange-600" : "text-slate-700"}`}>{item.stock_quantity}</td><td className="px-4 py-2.5 text-slate-600">{item.min_stock}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.purchase_price)}</td><td className="px-4 py-2.5 text-slate-500">{item.last_stock_date ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.remark ?? item.supplier ?? "-"}</td></tr>)}</tbody></table></div></div> : <div className="space-y-4"><PanelCard title="新增采购记录"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><SmallSelect value={purchaseDraft.supplier} onChange={(v) => setPurchaseDraft((d) => ({ ...d, supplier: v }))} options={suppliers.length ? suppliers.map((item) => item.name) : ["未指定"]} /><SmallInput value={purchaseDraft.item_name} onChange={(v) => setPurchaseDraft((d) => ({ ...d, item_name: v }))} placeholder="品名" /><SmallInput value={purchaseDraft.quantity} onChange={(v) => setPurchaseDraft((d) => ({ ...d, quantity: v }))} type="number" placeholder="数量" /><SmallSelect value={purchaseDraft.unit} onChange={(v) => setPurchaseDraft((d) => ({ ...d, unit: v }))} options={["个", "米", "根", "套", "张"]} /><SmallInput value={purchaseDraft.unit_price} onChange={(v) => setPurchaseDraft((d) => ({ ...d, unit_price: v }))} type="number" placeholder="单价" /><SmallInput value={purchaseDraft.purchase_date} onChange={(v) => setPurchaseDraft((d) => ({ ...d, purchase_date: v }))} type="date" /><SmallSelect value={purchaseDraft.status} onChange={(v) => setPurchaseDraft((d) => ({ ...d, status: v }))} options={["未付款", "部分付款", "已付款"]} /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">采购单号</th><th className="px-4 py-2.5 font-semibold text-slate-600">供应商</th><th className="px-4 py-2.5 font-semibold text-slate-600">品名</th><th className="px-4 py-2.5 font-semibold text-slate-600">数量</th><th className="px-4 py-2.5 font-semibold text-slate-600">单价</th><th className="px-4 py-2.5 font-semibold text-slate-600">总价</th><th className="px-4 py-2.5 font-semibold text-slate-600">采购日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">状态</th></tr></thead><tbody>{purchases.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.id}</td><td className="px-4 py-2.5 text-slate-700">{item.supplier}</td><td className="px-4 py-2.5 text-slate-600">{item.item_name}</td><td className="px-4 py-2.5 text-slate-600">{item.quantity} {item.unit}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.unit_price)}</td><td className="px-4 py-2.5 font-semibold text-red-600">{formatMoney(item.total_amount)}</td><td className="px-4 py-2.5 text-slate-500">{item.purchase_date}</td><td className="px-4 py-2.5 text-slate-600">{item.status}</td></tr>)}</tbody></table></div></div>}</div>;
}

// ─── Employees ───────────────────────────────────────────────────────────────

function formatAppointmentDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getAppointmentStatus(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "待确认";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (date < start) return "已完成";
  if (date >= start && date < end) return "今日预约";
  return "待上门";
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "今日预约": "bg-amber-50 text-amber-700",
    "待上门": "bg-sky-50 text-sky-700",
    "已完成": "bg-emerald-50 text-emerald-700",
    "待确认": "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] ?? styles["待确认"]}`}>{status}</span>;
}

function AppointmentsSection({ appointments, setAppointments, clients }: { appointments: MeasurementAppointmentRecord[]; setAppointments: React.Dispatch<React.SetStateAction<MeasurementAppointmentRecord[]>>; clients: ContactRecord[]; }) {
  const today = todayIso();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [draft, setDraft] = useState({ client_id: "", client_name: "", phone: "", address: "", appointment_date: `${today}T10:00`, description: "" });

  const clientOptions = clients.map((item) => ({ value: item.id, label: item.name }));

  const filteredAppointments = useMemo(() => {
    return [...appointments]
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
      .filter((item) => {
        const status = getAppointmentStatus(item.appointment_date);
        const keyword = search.trim().toLowerCase();
        const matchesSearch = !keyword || item.client_name.toLowerCase().includes(keyword) || (item.phone ?? "").toLowerCase().includes(keyword) || (item.address ?? "").toLowerCase().includes(keyword);
        const matchesStatus = statusFilter === "全部" || status === statusFilter;
        return matchesSearch && matchesStatus;
      });
  }, [appointments, search, statusFilter]);

  const stats = {
    total: appointments.length,
    today: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "今日预约").length,
    upcoming: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "待上门").length,
    done: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "已完成").length,
  };

  function hydrateFromClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    setDraft((prev) => ({
      ...prev,
      client_id: clientId,
      client_name: client?.name ?? prev.client_name,
      phone: client?.phone ?? prev.phone,
      address: client?.address ?? prev.address,
    }));
  }

  function addAppointment() {
    if (!draft.client_name.trim() || !draft.appointment_date) return;
    setAppointments((prev) => [{
      id: `APT-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`,
      client_id: draft.client_id || undefined,
      client_name: draft.client_name.trim(),
      phone: draft.phone || undefined,
      address: draft.address || undefined,
      appointment_date: draft.appointment_date,
      description: draft.description || undefined,
    }, ...prev]);
    setDraft({ client_id: "", client_name: "", phone: "", address: "", appointment_date: `${todayIso()}T10:00`, description: "" });
  }

  function exportAppointments() {
    downloadCsv(`biz-appointments-${todayIso()}.csv`, [
      ["客户", "电话", "地址", "预约时间", "状态", "说明"],
      ...filteredAppointments.map((item) => [item.client_name, item.phone ?? "", item.address ?? "", item.appointment_date, getAppointmentStatus(item.appointment_date), item.description ?? ""]),
    ]);
  }

  function printAppointments() {
    openPrintWindow(buildSimpleTablePrintHTML("测量预约", `共 ${filteredAppointments.length} 条`, ["客户", "电话", "地址", "预约时间", "状态", "说明"], filteredAppointments.map((item) => [item.client_name, item.phone ?? "-", item.address ?? "-", formatAppointmentDate(item.appointment_date), getAppointmentStatus(item.appointment_date), item.description ?? "-"])));
  }

  return <div><SectionHeader eyebrow="Measurement Appointments" title="测量预约" actions={<><ActionBtn onClick={exportAppointments}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printAppointments}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={addAppointment}>+ 新建预约</ActionBtn></>} /><StatStrip items={[{ label: "预约总数", value: String(stats.total) }, { label: "今日上门", value: String(stats.today), accent: "text-amber-600" }, { label: "待上门", value: String(stats.upcoming), accent: "text-sky-600" }, { label: "已完成", value: String(stats.done), accent: "text-emerald-600" }]} /><div className="mb-4 grid gap-4 xl:grid-cols-[1.1fr_2fr]"><PanelCard title="新增测量预约" note="来自 Base44 的预约能力，本站先落地本地排期与客户联动，不直接同步 Google Calendar。"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><select value={draft.client_id || ""} onChange={(e) => hydrateFromClient(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"><option value="">选择客户后自动带出电话和地址</option>{clientOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><SmallInput value={draft.client_name} onChange={(v) => setDraft((d) => ({ ...d, client_name: v }))} placeholder="客户名称" /><SmallInput value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} placeholder="电话" /><div className="sm:col-span-2 xl:col-span-2"><SmallInput value={draft.address} onChange={(v) => setDraft((d) => ({ ...d, address: v }))} placeholder="测量地址" /></div><SmallInput value={draft.appointment_date} onChange={(v) => setDraft((d) => ({ ...d, appointment_date: v }))} type="datetime-local" /><div className="sm:col-span-2 xl:col-span-3"><SmallInput value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="描述，例如复尺、现场确认、批发布样" /></div></div><p className="mt-2 text-[11px] text-slate-400">原始应用里预约实体还带 Google Calendar event id。当前网站架构没有外部日历凭证和同步流，所以先保留字段但只做站内排期。</p></PanelCard><PanelCard title="排期列表"><div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[180px] flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索客户 / 电话 / 地址" className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"><option>全部</option><option>今日预约</option><option>待上门</option><option>已完成</option></select></div><div className="space-y-2">{filteredAppointments.length ? filteredAppointments.map((item) => { const status = getAppointmentStatus(item.appointment_date); return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{item.client_name}</span><AppointmentStatusBadge status={status} /></div><p className="mt-1 text-xs text-slate-500">{formatAppointmentDate(item.appointment_date)}{item.phone ? ` · ${item.phone}` : ""}</p><p className="mt-1 text-xs text-slate-500">{item.address ?? "未填写地址"}</p></div><button onClick={() => setAppointments((prev) => prev.filter((entry) => entry.id !== item.id))} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button></div>{item.description ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.description}</p> : null}</div>; }) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">当前没有预约记录</div>}</div></PanelCard></div></div>;
}

type StaffSub = "staff" | "payroll";

function EmployeesSection({ employees, setEmployees, payrolls, setPayrolls }: { employees: EmployeeRecord[]; setEmployees: React.Dispatch<React.SetStateAction<EmployeeRecord[]>>; payrolls: PayrollRecord[]; setPayrolls: React.Dispatch<React.SetStateAction<PayrollRecord[]>>; }) {
  const [sub, setSub] = useState<StaffSub>("staff");
  const today = todayIso();
  const month = monthIso();
  const contractAlertCutoff = addDaysIso(today, 45);
  const [staffDraft, setStaffDraft] = useState({ name: "", position: "", phone: "", hire_date: today, contract_end: "", monthly_salary: "" });
  const [payrollDraft, setPayrollDraft] = useState({ employee_name: employees[0]?.name ?? "", base_salary: "", bonus: "", deduction: "", payment_status: "未发放" });
  const activeCount = employees.filter((item) => item.status === "在职").length;
  const pendingSalary = payrolls.filter((item) => item.month === month).reduce((sum, item) => sum + item.net_salary, 0);
  const paidSalary = payrolls.filter((item) => item.month === month && item.payment_status === "已发放").reduce((sum, item) => sum + item.net_salary, 0);
  const contractAlert = employees.filter((item) => item.contract_end && item.contract_end <= contractAlertCutoff).length;
  function exportEmployees() { if (sub === "staff") { downloadMappedCsv(`biz-employees-${todayIso()}.csv`, ["姓名", "职位", "电话", "入职日期", "合同到期", "月薪", "状态"], employees, (item) => [item.name, item.position ?? "", item.phone ?? "", item.hire_date ?? "", item.contract_end ?? "", item.monthly_salary, item.status]); return; } downloadMappedCsv(`biz-payrolls-${todayIso()}.csv`, ["月份", "员工", "基本工资", "奖金", "扣款", "实发金额", "支付状态"], payrolls, (item) => [item.month, item.employee_name, item.base_salary, item.bonus, item.deduction, item.net_salary, item.payment_status]); }
  function printEmployees() { if (sub === "staff") { openPrintWindow(buildSimpleTablePrintHTML("员工档案", `共 ${employees.length} 条`, ["姓名", "职位", "电话", "入职日期", "合同到期", "月薪", "状态"], employees.map((item) => [item.name, item.position ?? "-", item.phone ?? "-", item.hire_date ?? "-", item.contract_end ?? "-", formatMoney(item.monthly_salary), item.status]))); return; } openPrintWindow(buildSimpleTablePrintHTML("工资记录", `共 ${payrolls.length} 条`, ["月份", "员工", "基本工资", "奖金", "扣款", "实发金额", "支付状态"], payrolls.map((item) => [item.month, item.employee_name, formatMoney(item.base_salary), formatMoney(item.bonus), formatMoney(item.deduction), formatMoney(item.net_salary), item.payment_status]))); }
  function addEmployee() { if (!staffDraft.name.trim()) return; setEmployees((prev) => [{ id: `EMP-${String(prev.length + 1).padStart(3, "0")}`, name: staffDraft.name.trim(), position: staffDraft.position || undefined, phone: staffDraft.phone || undefined, hire_date: staffDraft.hire_date || undefined, contract_end: staffDraft.contract_end || undefined, monthly_salary: Number(staffDraft.monthly_salary) || 0, status: "在职" }, ...prev]); setStaffDraft({ name: "", position: "", phone: "", hire_date: today, contract_end: "", monthly_salary: "" }); }
  function addPayroll() { const base = Number(payrollDraft.base_salary) || 0; const bonus = Number(payrollDraft.bonus) || 0; const deduction = Number(payrollDraft.deduction) || 0; if (!payrollDraft.employee_name || base <= 0) return; setPayrolls((prev) => [{ id: `PAY-${month}-${String(prev.length + 1).padStart(3, "0")}`, month, employee_name: payrollDraft.employee_name, base_salary: base, bonus, deduction, net_salary: base + bonus - deduction, payment_status: payrollDraft.payment_status }, ...prev]); setPayrollDraft({ employee_name: employees[0]?.name ?? "", base_salary: "", bonus: "", deduction: "", payment_status: "未发放" }); }
  return <div><SectionHeader eyebrow="Human Resources" title="员工管理" actions={<><ActionBtn onClick={exportEmployees}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printEmployees}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={sub === "staff" ? addEmployee : addPayroll}>+ {sub === "staff" ? "新建员工" : "录入工资"}</ActionBtn></>} /><StatStrip items={[{ label: "在职员工", value: String(activeCount) }, { label: "本月应发工资", value: formatMoney(pendingSalary), accent: "text-orange-600" }, { label: "本月已发工资", value: formatMoney(paidSalary), accent: "text-green-600" }, { label: "合同即将到期", value: String(contractAlert), accent: "text-red-600" }]} /><SegmentedControl options={[{ key: "staff", label: "员工档案" }, { key: "payroll", label: "工资记录" }]} value={sub} onChange={setSub} />{sub === "staff" ? <div className="space-y-4"><PanelCard title="新增员工"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><SmallInput value={staffDraft.name} onChange={(v) => setStaffDraft((d) => ({ ...d, name: v }))} placeholder="姓名" /><SmallInput value={staffDraft.position} onChange={(v) => setStaffDraft((d) => ({ ...d, position: v }))} placeholder="职位" /><SmallInput value={staffDraft.phone} onChange={(v) => setStaffDraft((d) => ({ ...d, phone: v }))} placeholder="电话" /><SmallInput value={staffDraft.hire_date} onChange={(v) => setStaffDraft((d) => ({ ...d, hire_date: v }))} type="date" /><SmallInput value={staffDraft.contract_end} onChange={(v) => setStaffDraft((d) => ({ ...d, contract_end: v }))} type="date" /><SmallInput value={staffDraft.monthly_salary} onChange={(v) => setStaffDraft((d) => ({ ...d, monthly_salary: v }))} type="number" placeholder="月薪" /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">姓名</th><th className="px-4 py-2.5 font-semibold text-slate-600">职位</th><th className="px-4 py-2.5 font-semibold text-slate-600">电话</th><th className="px-4 py-2.5 font-semibold text-slate-600">入职日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">合同到期</th><th className="px-4 py-2.5 font-semibold text-slate-600">月薪</th><th className="px-4 py-2.5 font-semibold text-slate-600">状态</th></tr></thead><tbody>{employees.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.name}</td><td className="px-4 py-2.5 text-slate-600">{item.position ?? "-"}</td><td className="px-4 py-2.5 text-slate-600">{item.phone ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.hire_date ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.contract_end ?? "-"}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.monthly_salary)}</td><td className="px-4 py-2.5 text-slate-600">{item.status}</td></tr>)}</tbody></table></div></div> : <div className="space-y-4"><PanelCard title="录入工资"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><SmallSelect value={payrollDraft.employee_name} onChange={(v) => setPayrollDraft((d) => ({ ...d, employee_name: v }))} options={employees.length ? employees.map((item) => item.name) : ["暂无员工"]} /><SmallInput value={payrollDraft.base_salary} onChange={(v) => setPayrollDraft((d) => ({ ...d, base_salary: v }))} type="number" placeholder="基本工资" /><SmallInput value={payrollDraft.bonus} onChange={(v) => setPayrollDraft((d) => ({ ...d, bonus: v }))} type="number" placeholder="奖金" /><SmallInput value={payrollDraft.deduction} onChange={(v) => setPayrollDraft((d) => ({ ...d, deduction: v }))} type="number" placeholder="扣款" /><SmallSelect value={payrollDraft.payment_status} onChange={(v) => setPayrollDraft((d) => ({ ...d, payment_status: v }))} options={["未发放", "已发放"]} /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">月份</th><th className="px-4 py-2.5 font-semibold text-slate-600">员工</th><th className="px-4 py-2.5 font-semibold text-slate-600">基本工资</th><th className="px-4 py-2.5 font-semibold text-slate-600">奖金</th><th className="px-4 py-2.5 font-semibold text-slate-600">扣款</th><th className="px-4 py-2.5 font-semibold text-slate-600">实发金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">支付状态</th></tr></thead><tbody>{payrolls.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 text-slate-700">{item.month}</td><td className="px-4 py-2.5 font-medium text-slate-700">{item.employee_name}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.base_salary)}</td><td className="px-4 py-2.5 text-green-600">{formatMoney(item.bonus)}</td><td className="px-4 py-2.5 text-rose-600">{formatMoney(item.deduction)}</td><td className="px-4 py-2.5 font-semibold text-slate-800">{formatMoney(item.net_salary)}</td><td className="px-4 py-2.5 text-slate-600">{item.payment_status}</td></tr>)}</tbody></table></div></div>}</div>;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

type QuoteSub = "quotes" | "showcase";

function QuotesSection({ quotes, setQuotes, showcases, setShowcases, settings }: { quotes: QuoteRecord[]; setQuotes: React.Dispatch<React.SetStateAction<QuoteRecord[]>>; showcases: ShowcaseRecord[]; setShowcases: React.Dispatch<React.SetStateAction<ShowcaseRecord[]>>; settings: BizSettings; }) {
  const [sub, setSub] = useState<QuoteSub>("quotes");
  const today = new Date().toISOString().slice(0, 10);
  const [quoteDraft, setQuoteDraft] = useState({ client_name: "", title: "", amount: "", valid_until: today, status: "草稿" });
  const [showcaseDraft, setShowcaseDraft] = useState({ name: "", category: "窗帘", image_count: "", description: "", status: "待整理" });
  function addQuote() { if (!quoteDraft.client_name.trim() || !quoteDraft.title.trim()) return; setQuotes((prev) => [{ id: `QT-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, client_name: quoteDraft.client_name.trim(), title: quoteDraft.title.trim(), amount: Number(quoteDraft.amount) || 0, created_at: today, valid_until: quoteDraft.valid_until || today, status: quoteDraft.status }, ...prev]); setQuoteDraft({ client_name: "", title: "", amount: "", valid_until: today, status: "草稿" }); }
  function addShowcase() { if (!showcaseDraft.name.trim()) return; setShowcases((prev) => [{ id: `GAL-${String(prev.length + 1).padStart(3, "0")}`, name: showcaseDraft.name.trim(), category: showcaseDraft.category, image_count: Number(showcaseDraft.image_count) || 0, description: showcaseDraft.description || undefined, created_at: today, status: showcaseDraft.status }, ...prev]); setShowcaseDraft({ name: "", category: "窗帘", image_count: "", description: "", status: "待整理" }); }
  function exportQuotes() {
    if (sub === "quotes") {
      downloadMappedCsv(`biz-quotes-${todayIso()}.csv`, ["报价单号", "客户", "标题", "金额", "创建日期", "有效期至", "状态"], quotes, (item) => [item.id, item.client_name, item.title, item.amount, item.created_at, item.valid_until, item.status]);
      return;
    }
    downloadMappedCsv(`biz-showcase-${todayIso()}.csv`, ["作品名称", "类别", "图片数", "描述", "创建日期", "状态"], showcases, (item) => [item.name, item.category, item.image_count, item.description ?? "", item.created_at, item.status]);
  }
  function printQuote(quote: QuoteRecord) {
    openPrintWindow(buildQuotePrintHTML(quote, settings));
  }
  function printQuotes() {
    if (sub === "quotes") {
      openPrintWindow(buildSimpleTablePrintHTML("报价单列表", `共 ${quotes.length} 条`, ["报价单号", "客户", "标题 / 项目", "报价金额", "创建日期", "有效期至", "状态"], quotes.map((item) => [item.id, item.client_name, item.title, formatMoney(item.amount), item.created_at, item.valid_until, item.status])));
      return;
    }
    openPrintWindow(buildSimpleTablePrintHTML("作品展示列表", `共 ${showcases.length} 条`, ["作品名称", "类别", "图片数", "描述", "创建日期", "展示状态"], showcases.map((item) => [item.name, item.category, item.image_count, item.description ?? "-", item.created_at, item.status])));
  }
  return <div><SectionHeader eyebrow="Quotes & Showcase" title="报价 & 展示" actions={<><ActionBtn onClick={exportQuotes}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printQuotes}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={sub === "quotes" ? addQuote : addShowcase}>+ {sub === "quotes" ? "新建报价单" : "新建作品"}</ActionBtn></>} /><StatStrip items={[{ label: "草稿", value: String(quotes.filter((item) => item.status === "草稿").length), accent: "text-slate-500" }, { label: "已发出", value: String(quotes.filter((item) => item.status === "已发出").length), accent: "text-blue-600" }, { label: "已成交", value: String(quotes.filter((item) => item.status === "已成交").length), accent: "text-green-600" }, { label: "展示作品", value: String(showcases.length), accent: "text-violet-600" }]} /><SegmentedControl options={[{ key: "quotes", label: "报价单" }, { key: "showcase", label: "作品展示" }]} value={sub} onChange={setSub} />{sub === "quotes" ? <div className="space-y-4"><PanelCard title="新增报价单"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><SmallInput value={quoteDraft.client_name} onChange={(v) => setQuoteDraft((d) => ({ ...d, client_name: v }))} placeholder="客户" /><SmallInput value={quoteDraft.title} onChange={(v) => setQuoteDraft((d) => ({ ...d, title: v }))} placeholder="标题 / 项目" /><SmallInput value={quoteDraft.amount} onChange={(v) => setQuoteDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" /><SmallInput value={quoteDraft.valid_until} onChange={(v) => setQuoteDraft((d) => ({ ...d, valid_until: v }))} type="date" /><SmallSelect value={quoteDraft.status} onChange={(v) => setQuoteDraft((d) => ({ ...d, status: v }))} options={["草稿", "已发出", "已成交", "已失效"]} /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">报价单号</th><th className="px-4 py-2.5 font-semibold text-slate-600">客户</th><th className="px-4 py-2.5 font-semibold text-slate-600">标题 / 项目</th><th className="px-4 py-2.5 font-semibold text-slate-600">报价金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">创建日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">有效期至</th><th className="px-4 py-2.5 font-semibold text-slate-600">状态</th><th className="px-4 py-2.5 font-semibold text-slate-600">操作</th></tr></thead><tbody>{quotes.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.id}</td><td className="px-4 py-2.5 text-slate-700">{item.client_name}</td><td className="px-4 py-2.5 text-slate-500">{item.title}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.amount)}</td><td className="px-4 py-2.5 text-slate-500">{item.created_at}</td><td className="px-4 py-2.5 text-slate-500">{item.valid_until}</td><td className="px-4 py-2.5 text-slate-600">{item.status}</td><td className="px-4 py-2.5"><button onClick={() => printQuote(item)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">打印</button></td></tr>)}</tbody></table></div></div> : <div className="space-y-4"><PanelCard title="新增作品展示"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><SmallInput value={showcaseDraft.name} onChange={(v) => setShowcaseDraft((d) => ({ ...d, name: v }))} placeholder="作品名称" /><SmallSelect value={showcaseDraft.category} onChange={(v) => setShowcaseDraft((d) => ({ ...d, category: v }))} options={["窗帘", "隔断", "雨棚", "扶手", "其他"]} /><SmallInput value={showcaseDraft.image_count} onChange={(v) => setShowcaseDraft((d) => ({ ...d, image_count: v }))} type="number" placeholder="图片数" /><SmallInput value={showcaseDraft.description} onChange={(v) => setShowcaseDraft((d) => ({ ...d, description: v }))} placeholder="描述" /><SmallSelect value={showcaseDraft.status} onChange={(v) => setShowcaseDraft((d) => ({ ...d, status: v }))} options={["待整理", "已发布", "隐藏"]} /></div></PanelCard><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">作品名称</th><th className="px-4 py-2.5 font-semibold text-slate-600">类别</th><th className="px-4 py-2.5 font-semibold text-slate-600">图片数</th><th className="px-4 py-2.5 font-semibold text-slate-600">描述</th><th className="px-4 py-2.5 font-semibold text-slate-600">创建日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">展示状态</th></tr></thead><tbody>{showcases.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.name}</td><td className="px-4 py-2.5 text-slate-600">{item.category}</td><td className="px-4 py-2.5 text-slate-600">{item.image_count}</td><td className="px-4 py-2.5 text-slate-500">{item.description ?? "-"}</td><td className="px-4 py-2.5 text-slate-500">{item.created_at}</td><td className="px-4 py-2.5 text-slate-600">{item.status}</td></tr>)}</tbody></table></div></div>}</div>;
}

// ─── Settings ────────────────────────────────────────────────────────────────

function SettingsField({
  label,
  value,
  note,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  note?: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-6"><label className="w-28 shrink-0 pt-2 text-xs font-semibold text-slate-600">{label}</label><div className="flex-1"><input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="h-8 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none" />{note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}</div></div>;
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode; }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 border-b border-slate-100 pb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3><div className="flex flex-col gap-3.5">{children}</div></div>;
}

function SettingsSection({ settings, setSettings }: { settings: BizSettings; setSettings: React.Dispatch<React.SetStateAction<BizSettings>>; }) {
  const update = (key: keyof BizSettings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: key === "default_tax_rate" || key === "fiscal_start_month" || key === "quote_valid_days"
        ? Number(value) || 0
        : value,
    }));
  };

  function exportSettings() {
    downloadCsv(`biz-settings-${todayIso()}.csv`, [
      ["字段", "值"],
      ["公司名称", settings.company_name],
      ["地址", settings.address],
      ["电话", settings.phone],
      ["电子邮箱", settings.email],
      ["网站", settings.website],
      ["税号(BN)", settings.tax_number],
      ["默认税率", settings.default_tax_rate],
      ["默认货币", settings.default_currency],
      ["财年开始月", settings.fiscal_start_month],
      ["银行账户", settings.bank_account],
      ["支付宝", settings.alipay],
      ["微信收款", settings.wechat_pay],
      ["其他方式", settings.other_payment],
      ["报价默认有效期", settings.quote_valid_days],
      ["报价页脚备注", settings.quote_footer],
      ["Logo URL", settings.logo_url],
    ]);
  }

  function printSettings() {
    openPrintWindow(buildSimpleTablePrintHTML("系统设置", "当前业务配置", ["字段", "值"], [
      ["公司名称", settings.company_name || "-"],
      ["地址", settings.address || "-"],
      ["电话", settings.phone || "-"],
      ["电子邮箱", settings.email || "-"],
      ["网站", settings.website || "-"],
      ["税号(BN)", settings.tax_number || "-"],
      ["默认税率", String(settings.default_tax_rate ?? "-")],
      ["默认货币", settings.default_currency || "-"],
      ["财年开始月", String(settings.fiscal_start_month ?? "-")],
      ["银行账户", settings.bank_account || "-"],
      ["支付宝", settings.alipay || "-"],
      ["微信收款", settings.wechat_pay || "-"],
      ["其他方式", settings.other_payment || "-"],
      ["报价默认有效期", String(settings.quote_valid_days ?? "-")],
      ["报价页脚备注", settings.quote_footer || "-"],
      ["Logo URL", settings.logo_url || "-"],
    ]));
  }

  return <div><SectionHeader eyebrow="Configuration" title="系统设置" actions={<><ActionBtn onClick={exportSettings}>↓ 导出设置</ActionBtn><ActionBtn onClick={printSettings}>🖨 打印设置</ActionBtn><ActionBtn tone="success">自动保存中</ActionBtn></>} /><div className="grid gap-4 lg:grid-cols-2"><SettingsGroup title="公司信息"><SettingsField label="公司名称" value={settings.company_name} onChange={(value) => update("company_name", value)} /><SettingsField label="地址" value={settings.address} onChange={(value) => update("address", value)} /><SettingsField label="电话" value={settings.phone} onChange={(value) => update("phone", value)} /><SettingsField label="电子邮箱" value={settings.email} onChange={(value) => update("email", value)} /><SettingsField label="网站" value={settings.website} onChange={(value) => update("website", value)} /></SettingsGroup><SettingsGroup title="税务 & 财务"><SettingsField label="税号 (BN)" value={settings.tax_number} note="Business Number" onChange={(value) => update("tax_number", value)} /><SettingsField label="默认税率" value={String(settings.default_tax_rate)} onChange={(value) => update("default_tax_rate", value)} type="number" /><SettingsField label="默认货币" value={settings.default_currency} onChange={(value) => update("default_currency", value)} /><SettingsField label="财年开始月" value={String(settings.fiscal_start_month)} onChange={(value) => update("fiscal_start_month", value)} type="number" /></SettingsGroup><SettingsGroup title="支付方式"><SettingsField label="银行账户" value={settings.bank_account} onChange={(value) => update("bank_account", value)} /><SettingsField label="支付宝" value={settings.alipay} onChange={(value) => update("alipay", value)} /><SettingsField label="微信收款" value={settings.wechat_pay} onChange={(value) => update("wechat_pay", value)} /><SettingsField label="其他方式" value={settings.other_payment} onChange={(value) => update("other_payment", value)} /></SettingsGroup><SettingsGroup title="报价单模板"><SettingsField label="默认有效期" value={String(settings.quote_valid_days)} note="Days until quote expires" onChange={(value) => update("quote_valid_days", value)} type="number" /><SettingsField label="页脚备注" value={settings.quote_footer} onChange={(value) => update("quote_footer", value)} /><SettingsField label="Logo URL" value={settings.logo_url} note="Used in printed quotes" onChange={(value) => update("logo_url", value)} /></SettingsGroup></div></div>;
}
// ─── Sidebar nav ─────────────────────────────────────────────────────────────

type Section =
  | "overview"
  | "orders"
  | "finance"
  | "quotes"
  | "clients"
  | "appointments"
  | "materials"
  | "employees"
  | "settings";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ key: Section; label: string; icon: string }>;
}> = [
  {
    label: "业务中心",
    items: [
      { key: "overview", label: "总览", icon: "⊞" },
      { key: "orders", label: "订单管理", icon: "≡" },
      { key: "finance", label: "收支管理", icon: "¥" },
      { key: "quotes", label: "报价展示", icon: "◇" },
    ],
  },
  {
    label: "资源管理",
    items: [
      { key: "clients", label: "客户档案", icon: "⊙" },
      { key: "appointments", label: "测量预约", icon: "◷" },
      { key: "materials", label: "物料库存", icon: "▤" },
      { key: "employees", label: "员工管理", icon: "♟" },
    ],
  },
  {
    label: "系统",
    items: [{ key: "settings", label: "系统设置", icon: "⚙" }],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardBizPage() {
  const [section, setSection] = useState<Section>("overview");
  const [orders, setOrders] = useState<BizOrder[]>(bizOrders);
  const [clients, setClients] = useState<ContactRecord[]>(bizClients);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(bizSuppliers);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(bizExpenses);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(bizCashEntries);
  const [materials, setMaterials] = useState<MaterialRecord[]>(bizMaterials);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(bizPurchases);
  const [employees, setEmployees] = useState<EmployeeRecord[]>(bizEmployees);
  const [appointments, setAppointments] = useState<MeasurementAppointmentRecord[]>(bizAppointments);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>(bizPayrolls);
  const [quotes, setQuotes] = useState<QuoteRecord[]>(bizQuotes);
  const [showcases, setShowcases] = useState<ShowcaseRecord[]>(bizShowcases);
  const [settings, setSettings] = useState<BizSettings>(bizSettings);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const skipNextPersistRef = useRef(true);
  const orderSummary = useMemo(() => summarizeOrders(orders), [orders]);

  useEffect(() => {
    let cancelled = false;

    async function loadStore() {
      try {
        const response = await fetch("/api/biz-store", { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const payload = (await response.json()) as { ok: boolean; data: BizStoreSnapshot };
        if (cancelled || !payload?.data) return;
        setOrders(payload.data.orders ?? []);
        setClients(payload.data.clients ?? []);
        setSuppliers(payload.data.suppliers ?? []);
        setExpenses(payload.data.expenses ?? []);
        setCashEntries(payload.data.cashEntries ?? []);
        setMaterials(payload.data.materials ?? []);
        setPurchases(payload.data.purchases ?? []);
        setEmployees(payload.data.employees ?? []);
        setAppointments(payload.data.appointments ?? []);
        setPayrolls(payload.data.payrolls ?? []);
        setQuotes(payload.data.quotes ?? []);
        setShowcases(payload.data.showcases ?? []);
        setSettings(payload.data.settings ?? bizSettings);
      } catch {
        setSaveState("error");
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }

    loadStore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await fetch("/api/biz-store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orders,
            clients,
            suppliers,
            expenses,
            cashEntries,
            materials,
            purchases,
            employees,
            appointments,
            payrolls,
            quotes,
            showcases,
            settings,
          } satisfies BizStoreSnapshot),
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isHydrated, orders, clients, suppliers, expenses, cashEntries, materials, purchases, employees, appointments, payrolls, quotes, showcases, settings]);

  return (
    <PageSection>
      <DashboardPageHeader
        eyebrow="Owner Backend · Business"
        title="业务管理"
        description={`订单、财务、客户、物料、员工与设置的统一操作界面。${saveState === "saving" ? " 正在保存…" : saveState === "saved" ? " 已持久化保存" : saveState === "error" ? " 保存异常" : ""}`}
      />

      <div className="mt-4 flex min-h-[600px] overflow-hidden rounded-[20px] bg-white shadow-sm">
        <nav className="w-40 shrink-0 border-r border-slate-100 bg-slate-50 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium transition-colors ${
                    section === item.key
                      ? "bg-white text-slate-900 shadow-sm border-r-2 border-blue-500"
                      : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
                  }`}
                >
                  <span className="text-sm leading-none">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1 overflow-x-auto p-5">
          {section === "overview" && (
            <OverviewSection
              onNavigate={(k) => setSection(k as Section)}
              orderSummary={orderSummary}
              expenses={expenses}
              payrolls={payrolls}
              quotes={quotes}
              clients={clients}
              suppliers={suppliers}
              materials={materials}
              employees={employees}
            />
          )}
          {section === "orders" && <OrdersSection orders={orders} setOrders={setOrders} />}
          {section === "finance" && (
            <FinanceSection
              orders={orders}
              expenses={expenses}
              setExpenses={setExpenses}
              cashEntries={cashEntries}
              setCashEntries={setCashEntries}
              payrolls={payrolls}
            />
          )}
          {section === "quotes" && (
            <QuotesSection
              quotes={quotes}
              setQuotes={setQuotes}
              showcases={showcases}
              setShowcases={setShowcases}
              settings={settings}
            />
          )}
          {section === "clients" && (
            <ClientsSection
              clients={clients}
              setClients={setClients}
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              orders={orders}
              appointments={appointments}
              quotes={quotes}
              setAppointments={setAppointments}
              setQuotes={setQuotes}
            />
          )}
          {section === "appointments" && (
            <AppointmentsSection
              appointments={appointments}
              setAppointments={setAppointments}
              clients={clients}
            />
          )}
          {section === "materials" && (
            <MaterialsSection
              materials={materials}
              setMaterials={setMaterials}
              purchases={purchases}
              setPurchases={setPurchases}
              suppliers={suppliers}
            />
          )}
          {section === "employees" && (
            <EmployeesSection
              employees={employees}
              setEmployees={setEmployees}
              payrolls={payrolls}
              setPayrolls={setPayrolls}
            />
          )}
          {section === "settings" && <SettingsSection settings={settings} setSettings={setSettings} />}
        </div>
      </div>
    </PageSection>
  );
}

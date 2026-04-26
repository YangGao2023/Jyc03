"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DashboardPageHeader } from "../components";
import {
  bizOrders,
  bizCashEntries,
  bizClients,
  bizEmployees,
  bizAttendances,
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
  bizPrintArchives,
  summarizeOrders,
  type BizOrder,
  type BizSettings,
  type CashEntry,
  type ContactRecord,
  type EmployeeRecord,
  type AttendanceRecord,
  type ExpenseRecord,
  type MaterialRecord,
  type MaterialRow,
  type MeasurementAppointmentRecord,
  type PaymentRecord,
  type PayrollRecord,
  type PrintArchiveRecord,
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

function getPrintTemplateSettings(settings?: BizSettings) {
  const phoneLines = (settings?.phones || settings?.phone || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    invoiceTitle: settings?.invoice_title?.trim() || "Invoice",
    pickingTitle: settings?.picking_title?.trim() || "\u9886\u6599\u5355 / Worker Pickup Sheet",
    companyName: settings?.company_name?.trim() || "JYC STEEL GROUP INC",
    companyNameZh: settings?.company_name_zh?.trim() || "",
    companyAddress: settings?.company_address?.trim() || settings?.address?.trim() || "34-41 College Point Blvd, Flushing, NY,11354",
    phoneLines,
    phoneDisplay: phoneLines.join(" | "),
    email: settings?.email?.trim() || "",
    website: settings?.website?.trim() || "WWW.JYCNYC.NET",
    zelle: settings?.zelle?.trim() || "3478227777",
    invoiceNote: settings?.invoice_note?.trim() || "1. Customer will be billed after indicating acceptance of this quote.\n2. 40% deposit required when placing the order.\n3. When the job is complete, the balance must be paid in full.\n4. Extra requirements will charge extra.\n5. Warranty depends on the size and style.",
  };
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

function mapRows<T>(items: T[], mapRow: (item: T) => Array<string | number>) {
  return items.map(mapRow);
}

function buildPrintArchiveFileName(orderNumber: string, printType: string, createdAt: string) {
  const stamp = createdAt.replace(/[T:\.]/g, "-").slice(0, 19);
  const suffix = printType === "pickup" ? "pickup-sheet" : "invoice";
  return `${orderNumber}-${suffix}-${stamp}.html`;
}

function downloadHtmlFile(filename: string, html: string) {
  downloadTextFile(filename, html, "text/html;charset=utf-8");
}

function formatPrintTypeLabel(printType: string) {
  return printType === "pickup" ? "领料单" : "发票单";
}

type TabularSchemaConfig = {
  title: string;
  filePrefix: string;
  columns: string[];
  exportRows: () => Array<Array<string | number>>;
  printRows: () => Array<Array<string | number>>;
};

type SplitTabularSchemaConfig = {
  title: string;
  filePrefix: string;
  exportColumns: string[];
  printColumns: string[];
  exportRows: () => Array<Array<string | number>>;
  printRows: () => Array<Array<string | number>>;
};

function exportTabularSchema(config: TabularSchemaConfig | SplitTabularSchemaConfig) {
  const columns = "columns" in config ? config.columns : config.exportColumns;
  downloadCsv(`${config.filePrefix}-${todayIso()}.csv`, [columns, ...config.exportRows()]);
}

function printTabularSchema(config: TabularSchemaConfig | SplitTabularSchemaConfig, subtitle: string) {
  const columns = "columns" in config ? config.columns : config.printColumns;
  openPrintWindow(buildSimpleTablePrintHTML(config.title, subtitle, columns, config.printRows()));
}

async function copyPlainText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

function formatSlashDate(value?: string) {
  if (!value) return "";
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  return `${year}/${Number(month)}/${Number(day)}`;
}

function formatAppointmentCopyText(item: MeasurementAppointmentRecord) {
  const [datePart, timePart = ""] = item.appointment_date.split("T");
  const time = timePart.slice(0, 5);
  return [
    `预约日期：${formatSlashDate(datePart)}`,
    `预约时间段：${time}`,
    `描述：${item.description ?? ""}`,
    `客户名：${item.client_name}`,
    `地址：${item.address ?? ""}`,
    `电话：${item.phone ?? ""}`,
    "----------------------------",
  ].join("\n");
}

function getSupplierCategoryOptions(settings: BizSettings) {
  return (settings.supplier_categories || "布料\n五金\n玻璃\n物流\n其他")
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function calcUsdCost(factoryPriceRmb: number, weight?: number) {
  return Number((((weight && weight > 0 ? weight : 1) + factoryPriceRmb) / 7).toFixed(2));
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
  const overviewConfig: TabularSchemaConfig = {
    title: "业务总览",
    filePrefix: "biz-overview",
    columns: ["模块", "指标", "值"],
    exportRows: () => domains.flatMap((domain) => domain.stats.map((stat) => [domain.title, stat.label, stat.value])),
    printRows: () => domains.flatMap((domain) => domain.stats.map((stat) => [domain.title, stat.label, stat.value])),
  };

  function exportOverview() {
    exportTabularSchema(overviewConfig);
  }

  function printOverview() {
    printTabularSchema(overviewConfig, "当前业务概况");
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

const PAYMENT_METHODS = ["现金", "支票", "刷卡", "转账"];

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

function PrintArchiveList({
  records,
  onReprint,
}: {
  records: PrintArchiveRecord[];
  onReprint: (record: PrintArchiveRecord) => void;
}) {
  if (!records.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
        还没有保存的打印单
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => (
        <div key={record.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900">{record.title}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {formatPrintTypeLabel(record.print_type)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{record.created_at.slice(0, 16).replace("T", " ")}{record.summary ? ` · ${record.summary}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onReprint(record)} className="rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 transition-colors">再次打印</button>
              <button onClick={() => downloadHtmlFile(record.file_name, record.html)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 transition-colors">下载 HTML</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCustomerInvoiceHTML(order: BizOrder, draft: DraftFields, rows: MaterialRow[], settings?: BizSettings): string {
  const brandBlue = "#0457da";
  const isCustom = order.order_type === "定制单";
  const taxAmount = (draft.total_price || 0) * (draft.tax_rate || 0) / 100;
  const totalAfterTax = calcTotalAfterTax(draft.total_price || 0, draft.tax_rate || 0, draft.discount || 0);
  const photo = draft.preview_image
    ? `<img src="${escHtml(draft.preview_image)}" alt="preview" style="width:100%;height:100%;object-fit:cover;display:block"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#dbeafe;color:#1e3a8a;font-weight:700;font-size:18px">PHOTO</div>`;
  const template = getPrintTemplateSettings(settings);
  const notes = (draft.remarks || template.invoiceNote)
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
        <h1>${escHtml(template.companyAddress)}</h1>
        <p>${escHtml(template.companyName)}</p>
      </div>
      <div style="text-align:right" class="officePhone">
        <h1>${escHtml(template.phoneDisplay ? `OFFICE: ${template.phoneDisplay}` : "OFFICE")}</h1>
      </div>
    </div>
    <div class="topbox" style="justify-content:center;text-align:center">
      <div><h1>${escHtml(template.companyNameZh || template.companyName)}</h1></div>
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
      <div class="sectionBlue" style="text-align:center">${escHtml(template.invoiceTitle)}</div>
      <div class="big">${escHtml(order.order_number)}</div>
      <div class="date">${escHtml(order.order_date || "-")}</div>
    </div>
  </div>

  <div class="midBlue">
    <span>${escHtml(template.website)}</span>
    <span>${escHtml(template.zelle ? `Zelle ${template.zelle}` : template.email || "")}</span>
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

function buildWorkerPickupHTML(order: BizOrder, rows: MaterialRow[], settings?: BizSettings): string {
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
  settings,
  materials,
  printArchives,
  onBack,
  onSave,
  onSavePrintArchive,
  onOfficeEntry,
}: {
  order: BizOrder;
  settings: BizSettings;
  materials: MaterialRecord[];
  printArchives: PrintArchiveRecord[];
  onBack: () => void;
  onSave: (updated: BizOrder) => void;
  onSavePrintArchive: (record: PrintArchiveRecord) => void;
  onOfficeEntry: (entry: CashEntry) => void;
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

  const [paymentMode, setPaymentMode] = useState<"payment" | "refund">("payment");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    date: today,
    amount: "",
    method: "现金",
    note: "",
    office: false,
  });
  const orderPrintArchives = useMemo(
    () => printArchives.filter((item) => item.order_number === order.order_number).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [order.order_number, printArchives],
  );

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

  function buildPrintArchive(printType: "invoice" | "pickup") {
    const updatedOrder = buildUpdated();
    const html = printType === "pickup"
      ? buildWorkerPickupHTML(updatedOrder, materialRows, settings)
      : buildCustomerInvoiceHTML(updatedOrder, draft, materialRows, settings);
    const createdAt = new Date().toISOString();
    return {
      id: `PRINT-${createdAt.replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      order_number: updatedOrder.order_number,
      client_name: updatedOrder.client_name,
      order_type: updatedOrder.order_type,
      print_type: printType,
      title: `${updatedOrder.order_number} ${printType === "pickup" ? "领料单" : "发票单"}`,
      created_at: createdAt,
      created_by: "业务后台",
      amount: updatedOrder.total_after_tax ?? updatedOrder.total_price ?? 0,
      file_name: buildPrintArchiveFileName(updatedOrder.order_number, printType, createdAt),
      html,
      summary: `${updatedOrder.client_name} · ${formatMoney(updatedOrder.total_after_tax ?? updatedOrder.total_price ?? 0)}`,
    } satisfies PrintArchiveRecord;
  }

  function handleSavePrint(printType: "invoice" | "pickup", shouldOpen = false) {
    const record = buildPrintArchive(printType);
    onSave(buildUpdated());
    onSavePrintArchive(record);
    if (shouldOpen) openPrintWindow(record.html);
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
      office: newPayment.office,
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
    if (paymentMode === "payment" && newPayment.office) {
      onOfficeEntry({ id: `CASH-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, type: "收入", amount, date: newPayment.date, note: `${order.order_number} 办公室收款` });
    }
    if (paymentMode === "refund" && newPayment.office) {
      onOfficeEntry({ id: `CASH-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, type: "支出", amount, date: newPayment.date, note: `${order.order_number} 办公室退款` });
    }
    setNewPayment({ date: today, amount: "", method: "现金", note: "", office: false });
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
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => handleSavePrint("invoice")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700"
          >
            保存发票单
          </button>
          <button
            onClick={() => handleSavePrint("invoice", true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            打印并归档发票
          </button>
          {!isCustom && (
            <>
              <button
                onClick={() => handleSavePrint("pickup")}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
              >
                保存领料单
              </button>
              <button
                onClick={() => handleSavePrint("pickup", true)}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
              >
                打印并归档领料单
              </button>
            </>
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
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={newPayment.office} onChange={(e) => setNewPayment((p) => ({ ...p, office: e.target.checked }))} /> 这笔资金进入/流出办公室</label>
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

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">打印归档</h3>
              <p className="mt-1 text-[11px] text-slate-400">保存过的单据会留在这里，方便随时复打或下载 HTML。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              已归档 {orderPrintArchives.length} 份
            </span>
          </div>
          <PrintArchiveList records={orderPrintArchives} onReprint={(record) => openPrintWindow(record.html)} />
        </div>
      </div>

    </div>
  );
}

// ─── New Order Modal ──────────────────────────────────────────────────────────

function NewOrderModal({
  type,
  existingOrders,
  clients,
  onClose,
  onCreate,
}: {
  type: "定制单" | "批发单";
  existingOrders: BizOrder[];
  clients: ContactRecord[];
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
    deposit_office: false,
    preview_image: "",
  });

  function set(key: string, val: string | boolean) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  function hydrateClient(name: string) {
    const matched = clients.find((item) => item.name === name.trim());
    if (!matched) return;
    setFields((f) => ({ ...f, client_name: matched.name, phone: matched.phone ?? f.phone, address: matched.address ?? f.address }));
  }

  function handlePreviewUpload(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFields((f) => ({ ...f, preview_image: typeof reader.result === "string" ? reader.result : "" }));
    reader.readAsDataURL(file);
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
              office: fields.deposit_office,
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
      preview_image: type === "定制单" ? fields.preview_image || undefined : undefined,
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
                list="order-client-options"
                value={fields.client_name}
                onChange={(e) => {
                  set("client_name", e.target.value);
                  hydrateClient(e.target.value);
                }}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              />
              <datalist id="order-client-options">{clients.map((item) => <option key={item.id} value={item.name} />)}</datalist>
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
          {type === "定制单" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">参考图片</p>
              <div className="flex items-center gap-3">
                <label className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] text-slate-400">
                  {fields.preview_image ? <img src={fields.preview_image} alt="预览" className="h-full w-full object-cover" /> : "上传图片"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePreviewUpload(e.target.files?.[0])} />
                </label>
                <div className="flex-1 text-[11px] text-slate-500">新建定制单时就可以先放一张参考图，后面进订单详情还能继续替换。</div>
              </div>
            </div>
          )}
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
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={fields.deposit_office} onChange={(e) => set("deposit_office", e.target.checked)} /> 这笔收入进入办公室</label>
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

function OrdersSection({
  orders,
  materials,
  clients,
  setOrders,
  settings,
  printArchives,
  setPrintArchives,
  setCashEntries,
  setExpenses,
}: {
  orders: BizOrder[];
  materials: MaterialRecord[];
  clients: ContactRecord[];
  setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>;
  settings: BizSettings;
  printArchives: PrintArchiveRecord[];
  setPrintArchives: React.Dispatch<React.SetStateAction<PrintArchiveRecord[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
}) {
  const [selectedOrder, setSelectedOrder] = useState<BizOrder | null>(null);
  const [typeFilter, setTypeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [dateFilter, setDateFilter] = useState("全部");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [showOnlyBalance, setShowOnlyBalance] = useState(false);
  const [createType, setCreateType] = useState<"定制单" | "批发单" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<null | "pay" | "delete">(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const orderListColumns = ["订单号", "类型", "客户", "描述", "总金额", "下单日期", "状态", "余款", "操作"];
  const orderListConfig: SplitTabularSchemaConfig = {
    title: "订单列表",
    filePrefix: "biz-orders",
    exportColumns: ["订单号", "类型", "客户", "电话", "总额", "已付", "余款", "状态", "日期"],
    printColumns: ["订单号", "类型", "客户", "电话", "总额", "已付", "余款", "状态", "日期"],
    exportRows: () => mapRows(orders, (item) => [item.order_number, item.order_type, item.client_name, item.phone ?? "", String(item.total_after_tax ?? item.total_price ?? 0), String(item.amount_paid ?? 0), String(item.balance ?? 0), item.status ?? "", item.order_date ?? ""]),
    printRows: () => mapRows(filteredOrders, (item) => [item.order_number, item.order_type, item.client_name, item.phone ?? "-", formatMoney(item.total_after_tax ?? item.total_price ?? 0), formatMoney(item.amount_paid ?? 0), formatMoney(item.balance ?? 0), item.status ?? "-", item.order_date ?? "-"])
  };

  function exportOrders() {
    exportTabularSchema(orderListConfig);
  }
  function printOrders() {
    printTabularSchema(orderListConfig, `共 ${orderListConfig.printRows().length} 条`);
  }

  function handleSave(updated: BizOrder) {
    setOrders((prev) =>
      prev.map((o) => (o.order_number === updated.order_number ? updated : o))
    );
    setSelectedOrder(updated);
  }

  function handleCreate(newOrder: BizOrder) {
    setOrders((prev) => [newOrder, ...prev]);
    const depositRecord = newOrder.payment_history?.[0];
    if (depositRecord?.office) {
      setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: "收入", amount: depositRecord.amount, date: depositRecord.date, note: `${newOrder.order_number} 新单定金` }, ...prev]);
    }
  }

  function handleDelete(orderNumber: string) {
    setOrders((prev) => prev.filter((o) => o.order_number !== orderNumber));
    setExpenses((prev) => prev.filter((item) => ![item.target, item.detail, item.remark ?? ""].some((value) => value.includes(orderNumber))));
    setCashEntries((prev) => prev.filter((item) => !(item.note ?? "").includes(orderNumber)));
    setSelectedOrderNumbers((prev) => prev.filter((item) => item !== orderNumber));
    setDeleteConfirm(null);
  }

  function toggleSelection(orderNumber: string) {
    setSelectedOrderNumbers((prev) =>
      prev.includes(orderNumber)
        ? prev.filter((item) => item !== orderNumber)
        : [...prev, orderNumber]
    );
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setDate(weekStart.getDate() - 1);
  const lastWeekEndStr = lastWeekEnd.toISOString().slice(0, 10);
  const monthStartStr = todayStr.slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      !search.trim() ||
      order.order_number.toLowerCase().includes(search.trim().toLowerCase()) ||
      order.client_name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (order.description ?? "").toLowerCase().includes(search.trim().toLowerCase());
    const matchesType = typeFilter === "全部" || order.order_type === typeFilter;
    const matchesStatus = statusFilter === "全部" || order.status === statusFilter;
    const matchesBalance = !showOnlyBalance || (order.balance ?? 0) > 0;
    const d = order.order_date ?? "";
    const matchesDate =
      dateFilter === "全部" ||
      (dateFilter === "今天" && d === todayStr) ||
      (dateFilter === "昨天" && d === yesterdayStr) ||
      (dateFilter === "本周" && d >= weekStartStr && d <= todayStr) ||
      (dateFilter === "上周" && d >= lastWeekStartStr && d <= lastWeekEndStr) ||
      (dateFilter === "本月" && d.startsWith(monthStartStr)) ||
      (dateFilter === "上月" && d.startsWith(lastMonthStr)) ||
      (dateFilter === "自定义" && (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
    return matchesSearch && matchesType && matchesStatus && matchesBalance && matchesDate;
  });

  const summary = summarizeOrders(filteredOrders);
  const unpaidOrders = useMemo(
    () => orders.filter((order) => (order.balance ?? 0) > 0 && order.status !== "结清" && order.status !== "已关闭"),
    [orders],
  );
  const unpaidClientCount = useMemo(() => new Set(unpaidOrders.map((order) => order.client_name)).size, [unpaidOrders]);
  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderNumbers.includes(order.order_number)),
    [orders, selectedOrderNumbers],
  );
  const recentPrintArchives = useMemo(
    () => [...printArchives].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6),
    [printArchives],
  );
  const todayPrintCount = useMemo(
    () => printArchives.filter((item) => item.created_at.slice(0, 10) === todayStr).length,
    [printArchives, todayStr],
  );
  const selectedOutstanding = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + Math.max(0, order.balance ?? 0), 0),
    [selectedOrders],
  );
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderNumbers.includes(order.order_number));

  async function handleBulkSettle() {
    if (!selectedOrders.length) {
      setBulkAction(null);
      return;
    }
    setBulkBusy(true);
    const settledAt = todayIso();
    setOrders((prev) =>
      prev.map((order) => {
        if (!selectedOrderNumbers.includes(order.order_number)) return order;
        const remaining = Math.max(0, order.balance ?? 0);
        if (remaining <= 0) return order;
        const total = order.total_after_tax ?? order.total_price ?? 0;
        const nextPaid = Number(((order.amount_paid ?? 0) + remaining).toFixed(2));
        const nextHistory: PaymentRecord[] = [
          {
            date: settledAt,
            amount: remaining,
            method: "现金",
            note: "订单列表批量一键付清尾款",
            type: "payment",
          },
          ...(order.payment_history ?? []),
        ];
        return {
          ...order,
          amount_paid: nextPaid,
          balance: 0,
          total_after_tax: total || order.total_after_tax,
          status: total > 0 && nextPaid >= total ? "结清" : order.status ?? "结清",
          payment_history: nextHistory,
        };
      }),
    );
    setSelectedOrderNumbers([]);
    setBulkBusy(false);
    setBulkAction(null);
  }

  async function handleBulkDelete() {
    if (!selectedOrderNumbers.length) {
      setBulkAction(null);
      return;
    }
    setBulkBusy(true);
    setOrders((prev) => prev.filter((order) => !selectedOrderNumbers.includes(order.order_number)));
    setExpenses((prev) => prev.filter((item) => !selectedOrderNumbers.some((orderNumber) => [item.target, item.detail, item.remark ?? ""].some((value) => value.includes(orderNumber)))));
    setCashEntries((prev) => prev.filter((item) => !selectedOrderNumbers.some((orderNumber) => (item.note ?? "").includes(orderNumber))));
    setSelectedOrderNumbers([]);
    setBulkBusy(false);
    setBulkAction(null);
  }

  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        settings={settings}
        materials={materials}
        printArchives={printArchives}
        onBack={() => setSelectedOrder(null)}
        onSave={handleSave}
        onSavePrintArchive={(record) => setPrintArchives((prev) => [record, ...prev])}
        onOfficeEntry={(entry) => setCashEntries((prev) => [entry, ...prev])}
      />
    );
  }

  return (
    <div>
      {createType && (
        <NewOrderModal
          type={createType}
          existingOrders={orders}
          clients={clients}
          onClose={() => setCreateType(null)}
          onCreate={handleCreate}
        />
      )}

      <InlineConfirmDialog
        open={bulkAction === "pay"}
        title="批量一键付清"
        description={`将为选中的 ${selectedOrders.length} 个订单自动补齐尾款收款记录，并同步更新余款与状态。当前待收合计 ${formatMoney(selectedOutstanding)}。`}
        confirmLabel="确认付清"
        confirmTone="success"
        loading={bulkBusy}
        onCancel={() => !bulkBusy && setBulkAction(null)}
        onConfirm={handleBulkSettle}
      />
      <InlineConfirmDialog
        open={bulkAction === "delete"}
        title="批量删除订单"
        description={`确认删除选中的 ${selectedOrders.length} 个订单？此操作会直接从当前业务台账中移除这些订单。`}
        confirmLabel="确认删除"
        confirmTone="danger"
        loading={bulkBusy}
        onCancel={() => !bulkBusy && setBulkAction(null)}
        onConfirm={handleBulkDelete}
      />

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

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
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
              onChange={(e) => {
                const value = e.target.value;
                setDateFilter(value);
                if (value !== "自定义") {
                  setDateFrom("");
                  setDateTo("");
                }
              }}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option>全部</option>
              <option>今天</option>
              <option>昨天</option>
              <option>本周</option>
              <option>上周</option>
              <option>本月</option>
              <option>上月</option>
              <option>自定义</option>
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showOnlyBalance}
              onChange={(e) => setShowOnlyBalance(e.target.checked)}
            />
            仅看未收款
          </label>
          <button
            onClick={() => {
              setSearch("");
              setTypeFilter("全部");
              setStatusFilter("全部");
              setDateFilter("全部");
              setDateFrom("");
              setDateTo("");
              setShowOnlyBalance(false);
            }}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-400 hover:border-red-300 hover:text-red-500 transition-colors"
          >
            ✕ 重置
          </button>
        </div>
        {dateFilter === "自定义" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>日期范围</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700" />
            <span>至</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700" />
          </div>
        )}
        {selectedOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="text-xs text-sky-700">
              已选 <span className="font-semibold">{selectedOrders.length}</span> 个订单，待收尾款 <span className="font-semibold">{formatMoney(selectedOutstanding)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionBtn tone="success" onClick={() => setBulkAction("pay")}>一键付清尾款</ActionBtn>
              <ActionBtn tone="danger" onClick={() => setBulkAction("delete")}>批量删除</ActionBtn>
              <ActionBtn onClick={() => setSelectedOrderNumbers([])}>清空选择</ActionBtn>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={() => setSelectedOrderNumbers(allFilteredSelected ? [] : filteredOrders.map((order) => order.order_number))}
                  className="cursor-pointer"
                />
              </th>
              {orderListColumns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order: BizOrder) => {
                return (
                <tr
                  key={order.order_number}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      checked={selectedOrderNumbers.includes(order.order_number)}
                      onChange={() => toggleSelection(order.order_number)}
                      className="cursor-pointer"
                    />
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
                  <td className="px-3 py-2.5 text-slate-700">{formatMoney(order.total_after_tax ?? order.total_price ?? 0)}</td>
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
              )})
            ) : (
              <tr>
                <td
                  colSpan={orderListColumns.length + 2}
                  className="py-10 text-center text-sm text-slate-400"
                >
                  当前没有可显示的订单数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-4">
        {!!unpaidOrders.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-rose-700">未付清客户提醒</p>
              <p className="mt-1 text-xs text-rose-600">
                当前有 {unpaidClientCount} 位客户、{unpaidOrders.length} 个订单仍有尾款，待收合计 {formatMoney(unpaidOrders.reduce((sum, order) => sum + (order.balance ?? 0), 0))}
              </p>
            </div>
            <ActionBtn
              tone="danger"
              onClick={() => {
                setStatusFilter("未付清");
                setShowOnlyBalance(true);
              }}
            >
              查看未付清订单
            </ActionBtn>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <PanelCard title="打印闭环" note="订单打印现在支持保存归档，后面可以直接复打或下载 HTML。">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">今日归档</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{todayPrintCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">全部打印单</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{printArchives.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">最近一份</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{recentPrintArchives[0]?.order_number ?? "暂无"}</p>
                <p className="mt-1 text-[11px] text-slate-500">{recentPrintArchives[0] ? `${formatPrintTypeLabel(recentPrintArchives[0].print_type)} · ${recentPrintArchives[0].client_name}` : "先进入订单详情保存打印单"}</p>
              </div>
            </div>
          </PanelCard>
          <PanelCard title="最近打印归档" note="最新 6 份打印单，支持直接下载。">
            <div className="space-y-2">
              {recentPrintArchives.length ? recentPrintArchives.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{item.order_number} · {item.client_name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatPrintTypeLabel(item.print_type)} · {item.created_at.slice(0, 16).replace("T", " ")}</p>
                    </div>
                    <button onClick={() => downloadHtmlFile(item.file_name, item.html)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 transition-colors">下载</button>
                  </div>
                </div>
              )) : <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">还没有保存的打印单</div>}
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

// ─── Finance ─────────────────────────────────────────────────────────────────

type FinanceSub = "income" | "expense" | "cash" | "ledger" | "receivables" | "audit";

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
  { key: "cash", label: "办公室" },
  { key: "ledger", label: "月度账单" },
  { key: "receivables", label: "应收款" },
  { key: "audit", label: "财务体检" },
];

function getExpenseTypeOptions(settings: BizSettings) {
  const raw = (settings.expense_types || "采购\n工资\n物流\n办公\n其他")
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
  return raw.length ? Array.from(new Set(raw)) : ["采购", "工资", "物流", "办公", "其他"];
}

const RECEIVABLE_AGING_BUCKETS = [
  { key: "current", label: "0-30天", min: 0, max: 30, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "days31", label: "31-60天", min: 31, max: 60, tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "days61", label: "61-90天", min: 61, max: 90, tone: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "over90", label: "90+天", min: 91, max: Number.POSITIVE_INFINITY, tone: "bg-rose-50 text-rose-700 border-rose-200" },
] as const;

function diffReceivableDays(dateStr?: string) {
  if (!dateStr) return 0;
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - target.getTime()) / 86400000));
}

function getReceivableBucket(days: number) {
  return RECEIVABLE_AGING_BUCKETS.find((bucket) => days >= bucket.min && days <= bucket.max) ?? RECEIVABLE_AGING_BUCKETS[0];
}

function SmallInput({ value, onChange, placeholder, type = "text" }: { value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none" />;
}

function SmallSelect({ value, onChange, options, labels }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>; }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none">
      {options.map((option) => <option key={option} value={option}>{labels?.[option] || option || "未选择"}</option>)}
    </select>
  );
}

function isDateInRange(dateStr: string | undefined, startDate: string, endDate: string) {
  if (!dateStr) return false;
  const value = dateStr.slice(0, 10);
  if (!value) return false;
  if (startDate && value < startDate) return false;
  if (endDate && value > endDate) return false;
  return true;
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

function InlineConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmTone = "primary",
  loading = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger" | "success";
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <ActionBtn onClick={onCancel}>取消</ActionBtn>
          <ActionBtn tone={confirmTone} onClick={onConfirm}>
            {loading ? "处理中..." : confirmLabel}
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

type FinanceAuditOrderIssue = {
  kind: "order";
  orderNumber: string;
  clientName: string;
  issue: string;
  severity: "high" | "medium";
  currentValue: string;
  suggestedValue: string;
};

type FinanceAuditClientIssue = {
  kind: "client_balance";
  clientId: string;
  clientName: string;
  issue: string;
  severity: "medium";
  currentValue: string;
  suggestedValue: string;
};

type FinanceDuplicateClientIssue = {
  kind: "duplicate_client";
  key: string;
  clientNames: string[];
  issue: string;
  severity: "warning";
};

type FinanceAuditIssue = FinanceAuditOrderIssue | FinanceAuditClientIssue | FinanceDuplicateClientIssue;

type FinanceAuditReport = {
  scannedAt: string;
  orderIssueCount: number;
  clientIssueCount: number;
  duplicateClientCount: number;
  autoFixableCount: number;
  issues: FinanceAuditIssue[];
};

function getOrderTotalForAudit(order: BizOrder) {
  return order.total_after_tax ?? calcTotalAfterTax(order.total_price ?? 0, order.tax_rate ?? 0, order.discount ?? 0);
}

function getOrderPaymentNet(order: BizOrder) {
  const history = order.payment_history ?? [];
  if (!history.length) return order.amount_paid ?? 0;
  return history.reduce((sum, item) => sum + (item.type === "refund" ? -item.amount : item.amount), 0);
}

function normalizePhone(value?: string) {
  return (value ?? "").replace(/\D+/g, "");
}

function buildFinanceAuditReport(orders: BizOrder[], clients: ContactRecord[]): FinanceAuditReport {
  const issues: FinanceAuditIssue[] = [];
  const clientBalanceMap = new Map<string, number>();

  orders.forEach((order) => {
    const totalAfterTax = getOrderTotalForAudit(order);
    const paymentNet = getOrderPaymentNet(order);
    const expectedAmountPaid = Math.max(0, paymentNet);
    const expectedBalance = Math.max(0, totalAfterTax - expectedAmountPaid);
    const expectedStatus = deriveStatus(totalAfterTax, expectedAmountPaid, order.status ?? "下单");
    const currentAmountPaid = order.amount_paid ?? 0;
    const currentBalance = order.balance ?? Math.max(0, totalAfterTax - currentAmountPaid);

    if (Math.abs(currentAmountPaid - expectedAmountPaid) > 0.01) {
      issues.push({
        kind: "order",
        orderNumber: order.order_number,
        clientName: order.client_name,
        issue: "已付金额与收款记录不一致",
        severity: "high",
        currentValue: formatMoney(currentAmountPaid),
        suggestedValue: formatMoney(expectedAmountPaid),
      });
    }

    if (Math.abs(currentBalance - expectedBalance) > 0.01) {
      issues.push({
        kind: "order",
        orderNumber: order.order_number,
        clientName: order.client_name,
        issue: currentBalance < 0 ? "余款为负数" : "余款计算异常",
        severity: "high",
        currentValue: formatMoney(currentBalance),
        suggestedValue: formatMoney(expectedBalance),
      });
    }

    if ((order.status ?? "下单") !== expectedStatus) {
      issues.push({
        kind: "order",
        orderNumber: order.order_number,
        clientName: order.client_name,
        issue: "订单状态与收款进度不一致",
        severity: "medium",
        currentValue: order.status ?? "下单",
        suggestedValue: expectedStatus,
      });
    }

    if (order.status !== "已关闭") {
      clientBalanceMap.set(order.client_name, (clientBalanceMap.get(order.client_name) ?? 0) + expectedBalance);
    }
  });

  clients.forEach((client) => {
    const expectedBalance = Number((clientBalanceMap.get(client.name) ?? 0).toFixed(2));
    const currentBalance = Number((client.balance ?? 0).toFixed(2));
    if (Math.abs(currentBalance - expectedBalance) > 0.01) {
      issues.push({
        kind: "client_balance",
        clientId: client.id,
        clientName: client.name,
        issue: "客户档案余额未同步订单应收",
        severity: "medium",
        currentValue: formatMoney(currentBalance),
        suggestedValue: formatMoney(expectedBalance),
      });
    }
  });

  const duplicatePhoneGroups = new Map<string, ContactRecord[]>();
  clients.forEach((client) => {
    const key = normalizePhone(client.phone);
    if (!key) return;
    duplicatePhoneGroups.set(key, [...(duplicatePhoneGroups.get(key) ?? []), client]);
  });

  duplicatePhoneGroups.forEach((group, key) => {
    if (group.length < 2) return;
    issues.push({
      kind: "duplicate_client",
      key,
      clientNames: group.map((item) => item.name),
      issue: `发现 ${group.length} 个客户共用同一手机号`,
      severity: "warning",
    });
  });

  return {
    scannedAt: new Date().toISOString(),
    orderIssueCount: issues.filter((item) => item.kind === "order").length,
    clientIssueCount: issues.filter((item) => item.kind === "client_balance").length,
    duplicateClientCount: issues.filter((item) => item.kind === "duplicate_client").length,
    autoFixableCount: issues.filter((item) => item.kind !== "duplicate_client").length,
    issues,
  };
}

function applyFinanceAuditRepairs(orders: BizOrder[], clients: ContactRecord[]) {
  const clientBalanceMap = new Map<string, number>();

  const fixedOrders = orders.map((order) => {
    const totalAfterTax = getOrderTotalForAudit(order);
    const amountPaid = Math.max(0, getOrderPaymentNet(order));
    const balance = Math.max(0, totalAfterTax - amountPaid);
    const status = deriveStatus(totalAfterTax, amountPaid, order.status ?? "下单");

    if (order.status !== "已关闭") {
      clientBalanceMap.set(order.client_name, (clientBalanceMap.get(order.client_name) ?? 0) + balance);
    }

    return {
      ...order,
      total_after_tax: totalAfterTax,
      amount_paid: Number(amountPaid.toFixed(2)),
      balance: Number(balance.toFixed(2)),
      status,
    };
  });

  const fixedClients = clients.map((client) => ({
    ...client,
    balance: Number((clientBalanceMap.get(client.name) ?? 0).toFixed(2)),
  }));

  return { fixedOrders, fixedClients };
}

function FinanceSection({ orders, setOrders, expenses, setExpenses, cashEntries, setCashEntries, payrolls, clients, setClients, suppliers, employees, settings }: {
  orders: BizOrder[];
  setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>;
  expenses: ExpenseRecord[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  cashEntries: CashEntry[];
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  payrolls: PayrollRecord[];
  clients: ContactRecord[];
  setClients: React.Dispatch<React.SetStateAction<ContactRecord[]>>;
  suppliers: SupplierRecord[];
  employees: EmployeeRecord[];
  settings: BizSettings;
}) {
  const [sub, setSub] = useState<FinanceSub>("income");
  const today = new Date().toISOString().slice(0, 10);
  const expenseTypeOptions = useMemo(() => getExpenseTypeOptions(settings), [settings]);
  const officeTargets = useMemo(() => Array.from(new Set([...suppliers.map((item) => item.name), ...employees.map((item) => item.name), ...clients.map((item) => item.name)])), [suppliers, employees, clients]);
  const [draft, setDraft] = useState<FinanceDraft>({ target: "", detail: "", amount: "", expense_type: expenseTypeOptions[0] ?? "采购", payment_method: "转账", expense_date: today, remark: "" });
  const [auditReport, setAuditReport] = useState<FinanceAuditReport | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [confirmingExpenseId, setConfirmingExpenseId] = useState<string | null>(null);
  const [quickPayTarget, setQuickPayTarget] = useState<string | null>(null);
  const [quickPayFields, setQuickPayFields] = useState({ date: today, amount: "", method: "现金", note: "", office: false });
  const [expenseFromOffice, setExpenseFromOffice] = useState(false);
  const [showOfficeTransferModal, setShowOfficeTransferModal] = useState(false);
  const [officeTransferDraft, setOfficeTransferDraft] = useState({ type: "转入", amount: "", date: today, note: "" });
  const [financeDateStart, setFinanceDateStart] = useState(today);
  const [financeDateEnd, setFinanceDateEnd] = useState(today);
  const paymentRows = orders.flatMap((order) => (order.payment_history ?? []).map((record, index) => ({ order, record, key: `${order.order_number}-${index}` })));
  const filteredPaymentRows = paymentRows.filter(({ record }) => isDateInRange(record.date, financeDateStart, financeDateEnd));
  const filteredExpenses = expenses.filter((item) => isDateInRange(item.expense_date, financeDateStart, financeDateEnd));
  const filteredCashEntries = cashEntries.filter((item) => isDateInRange(item.date, financeDateStart, financeDateEnd));
  const totalIncome = filteredPaymentRows.reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
  const totalExpense = filteredExpenses.reduce((s, item) => s + item.amount, 0);
  const totalBalance = orders.reduce((s, o) => s + (o.balance ?? 0), 0);
  const payrollAmount = payrolls.reduce((s, item) => s + item.net_salary, 0);
  const cashBalance = filteredCashEntries.reduce((s, item) => s + (["收入", "转入"].includes(item.type) ? item.amount : -item.amount), 0);
  const receivableOrders = orders.filter((o) => (o.balance ?? 0) > 0 && o.status !== "已关闭");
  const filteredReceivableOrders = receivableOrders.filter((o) => isDateInRange(o.order_date, financeDateStart, financeDateEnd));
  const financeAuditPreview = useMemo(() => buildFinanceAuditReport(orders, clients), [orders, clients]);
  const activeAudit = auditReport ?? financeAuditPreview;
  const ledgerRows = Array.from(new Set([...filteredPaymentRows.map(({ record }) => (record.date ?? "").slice(0, 7)), ...filteredExpenses.map((e) => e.expense_date.slice(0, 7)), ...payrolls.filter((p) => (!financeDateStart || `${p.month}-01` >= financeDateStart) && (!financeDateEnd || `${p.month}-31` <= financeDateEnd)).map((p) => p.month)])).filter(Boolean).sort().reverse().map((month) => {
    const income = filteredPaymentRows.filter(({ record }) => (record.date ?? "").startsWith(month)).reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
    const expense = filteredExpenses.filter((item) => item.expense_date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
    const wage = payrolls.filter((item) => item.month === month).reduce((sum, item) => sum + item.net_salary, 0);
    return { month, income, expense, net: income - expense, wage, profit: income - expense - wage };
  });
  const financeConfigs: Record<FinanceSub, TabularSchemaConfig> = {
    income: {
      title: "订单收入",
      filePrefix: "biz-finance-income",
      columns: ["订单号", "客户", "金额", "支付方式", "日期", "明细", "类型"],
      exportRows: () => mapRows(filteredPaymentRows, ({ order, record }) => [order.order_number, order.client_name, record.amount, record.method, record.date, record.note ?? "", record.type === "refund" ? "退款" : "收款"]),
      printRows: () => mapRows(filteredPaymentRows, ({ order, record }) => [order.order_number, order.client_name, formatMoney(record.amount), record.method, record.date, record.note ?? "-", record.type === "refund" ? "退款" : "收款"]),
    },
    expense: {
      title: "支出清单",
      filePrefix: "biz-finance-expense",
      columns: ["对象", "明细", "金额", "类型", "付款方式", "日期", "备注"],
      exportRows: () => mapRows(filteredExpenses, (item) => [item.target, item.detail, item.amount, item.expense_type, item.payment_method, item.expense_date, item.remark ?? ""]),
      printRows: () => mapRows(filteredExpenses, (item) => [item.target, item.detail, formatMoney(item.amount), item.expense_type, item.payment_method, item.expense_date, item.remark ?? "-"]),
    },
    cash: {
      title: "办公室",
      filePrefix: "biz-finance-office",
      columns: ["类型", "金额", "日期", "备注"],
      exportRows: () => mapRows(filteredCashEntries, (item) => [item.type, item.amount, item.date, item.note ?? ""]),
      printRows: () => mapRows(filteredCashEntries, (item) => [item.type, formatMoney(item.amount), item.date, item.note ?? "-"]),
    },
    ledger: {
      title: "月度账单",
      filePrefix: "biz-finance-ledger",
      columns: ["月份", "收入", "支出", "净额", "工资", "净利润"],
      exportRows: () => mapRows(ledgerRows, (item) => [item.month, item.income, item.expense, item.net, item.wage, item.profit]),
      printRows: () => mapRows(ledgerRows, (item) => [item.month, formatMoney(item.income), formatMoney(item.expense), formatMoney(item.net), formatMoney(item.wage), formatMoney(item.profit)]),
    },
    receivables: {
      title: "应收款",
      filePrefix: "biz-finance-receivables",
      columns: ["客户", "订单号", "总额", "已付", "余款", "下单日期", "状态"],
      exportRows: () => mapRows(filteredReceivableOrders, (o) => [o.client_name, o.order_number, o.total_after_tax ?? o.total_price ?? 0, o.amount_paid ?? 0, o.balance ?? 0, o.order_date ?? "", o.status ?? ""]),
      printRows: () => mapRows(filteredReceivableOrders, (o) => [o.client_name, o.order_number, formatMoney(o.total_after_tax ?? o.total_price ?? 0), formatMoney(o.amount_paid ?? 0), formatMoney(o.balance ?? 0), o.order_date ?? "-", o.status ?? "-"]),
    },
    audit: {
      title: "财务体检",
      filePrefix: "biz-finance-audit",
      columns: ["类型", "对象", "问题", "当前值", "建议值"],
      exportRows: () => activeAudit.issues.map((item) => item.kind === "duplicate_client"
        ? ["重复客户", item.clientNames.join(" / "), item.issue, item.key, "请人工合并"]
        : [item.kind === "order" ? "订单" : "客户", item.kind === "order" ? item.orderNumber : item.clientName, item.issue, item.currentValue, item.suggestedValue]),
      printRows: () => activeAudit.issues.map((item) => item.kind === "duplicate_client"
        ? ["重复客户", item.clientNames.join(" / "), item.issue, item.key, "请人工合并"]
        : [item.kind === "order" ? "订单" : "客户", item.kind === "order" ? `${item.orderNumber} / ${item.clientName}` : item.clientName, item.issue, item.currentValue, item.suggestedValue]),
    },
  };

  function exportFinance() {
    exportTabularSchema(financeConfigs[sub]);
  }

  function printFinance() {
    const config = financeConfigs[sub];
    printTabularSchema(config, `共 ${config.printRows().length} 条`);
  }

  function runFinanceAudit() {
    setAuditReport(buildFinanceAuditReport(orders, clients));
  }

  function applyFinanceRepair() {
    const repaired = applyFinanceAuditRepairs(orders, clients);
    setOrders(repaired.fixedOrders);
    setClients(repaired.fixedClients);
    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));
  }

  function handleQuickPay(orderNumber: string) {
    const amount = parseFloat(quickPayFields.amount);
    if (!amount || amount <= 0) return;
    const newRecord: PaymentRecord = {
      date: quickPayFields.date,
      amount,
      method: quickPayFields.method,
      note: quickPayFields.note || undefined,
      type: "payment",
      office: quickPayFields.office,
    };
    setOrders((prev) =>
      prev.map((o) => {
        if (o.order_number !== orderNumber) return o;
        const nextHistory = [newRecord, ...(o.payment_history ?? [])];
        const nextPaid = Number(((o.amount_paid ?? 0) + amount).toFixed(2));
        const total = o.total_after_tax ?? o.total_price ?? 0;
        const nextBalance = Math.max(0, Number((total - nextPaid).toFixed(2)));
        const nextStatus = deriveStatus(total, nextPaid, o.status ?? "下单");
        return { ...o, payment_history: nextHistory, amount_paid: nextPaid, balance: nextBalance, status: nextStatus };
      }),
    );
    if (quickPayFields.office) {
      setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: "收入", amount, date: quickPayFields.date, note: `${orderNumber} 办公室收款` }, ...prev]);
    }
    setQuickPayTarget(null);
    setQuickPayFields({ date: today, amount: "", method: "现金", note: "", office: false });
  }

  function addExpense() {
    const amount = Number(draft.amount) || 0;
    if (!draft.target.trim() || !draft.detail.trim() || amount <= 0) return;
    const record: ExpenseRecord = { id: `EXP-${new Date().getFullYear()}-${String(expenses.length + 1).padStart(3, "0")}`, target: draft.target.trim(), detail: draft.detail.trim(), amount, expense_type: draft.expense_type, payment_method: draft.payment_method, expense_date: draft.expense_date, remark: draft.remark || undefined, office: expenseFromOffice };
    setExpenses((prev) => [record, ...prev]);
    if (expenseFromOffice) {
      setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: "支出", amount, date: draft.expense_date, note: `${record.target} · ${record.detail}` }, ...prev]);
    }
    setDraft({ target: "", detail: "", amount: "", expense_type: expenseTypeOptions[0] ?? "采购", payment_method: "转账", expense_date: today, remark: "" });
    setExpenseFromOffice(false);
    setShowExpenseModal(false);
  }

  function deleteExpense(expenseId: string) {
    setExpenses((prev) => prev.filter((item) => item.id !== expenseId));
    setConfirmingExpenseId(null);
  }

  function addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: officeTransferDraft.type, amount, date: officeTransferDraft.date, note: officeTransferDraft.note || undefined }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, note: "" });
    setShowOfficeTransferModal(false);
  }

  return (
    <div>
      <SectionHeader eyebrow="Finance Management" title="收支管理" actions={<><ActionBtn onClick={exportFinance}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printFinance}>🖨 打印当前表</ActionBtn>{sub === "audit" ? <ActionBtn onClick={runFinanceAudit}>↻ 重新扫描</ActionBtn> : null}{sub === "audit" ? <ActionBtn tone="success" onClick={applyFinanceRepair}>🔧 应用自动修复</ActionBtn> : null}{sub === "expense" ? <ActionBtn tone="primary" onClick={() => setShowExpenseModal(true)}>+ 录入支出</ActionBtn> : null}{sub === "cash" ? <ActionBtn tone="primary" onClick={() => setShowOfficeTransferModal(true)}>+ 办公室转入/转出</ActionBtn> : null}</>} />
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">当天日期</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{today}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">开始日期</p>
              <SmallInput value={financeDateStart} onChange={setFinanceDateStart} type="date" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">结束日期</p>
              <SmallInput value={financeDateEnd} onChange={setFinanceDateEnd} type="date" />
            </div>
            <ActionBtn onClick={() => { setFinanceDateStart(today); setFinanceDateEnd(today); }}>今天</ActionBtn>
            <ActionBtn onClick={() => { setFinanceDateStart(""); setFinanceDateEnd(""); }}>全部时间</ActionBtn>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sub === "income" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">筛选收入</p><p className="mt-1 text-base font-semibold text-emerald-600">{formatMoney(totalIncome)}</p></div> : null}
          {sub === "expense" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">筛选支出</p><p className="mt-1 text-base font-semibold text-rose-600">{formatMoney(totalExpense)}</p></div> : null}
          {sub === "cash" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">办公室净额</p><p className="mt-1 text-base font-semibold text-slate-900">{formatMoney(cashBalance)}</p></div> : null}
          {sub === "ledger" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">工资合计</p><p className="mt-1 text-base font-semibold text-amber-600">{formatMoney(payrollAmount)}</p></div> : null}
          {sub === "receivables" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">筛选应收款</p><p className="mt-1 text-base font-semibold text-amber-600">{formatMoney(filteredReceivableOrders.reduce((sum, item) => sum + (item.balance ?? 0), 0))}</p></div> : null}
          {sub === "audit" ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">待修复问题</p><p className="mt-1 text-base font-semibold text-rose-600">{activeAudit.autoFixableCount}</p></div> : null}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap border-b-2 border-slate-200 bg-white self-start">
        {FINANCE_SUBS.map((t) => <button key={t.key} onClick={() => setSub(t.key)} className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${sub === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>)}
      </div>

      {sub === "audit" && (
        <div className="mb-4">
          <PanelCard title="财务体检中心" note="参考源里的数据完整性检查与余款修复能力，这里落地为本地订单/客户账务扫描与自动修复。">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-rose-500">订单异常</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{activeAudit.orderIssueCount}</p>
                <p className="mt-1 text-xs text-rose-600">检查已付金额、余款和状态是否与收款记录一致</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-500">客户账龄</p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">{activeAudit.clientIssueCount}</p>
                <p className="mt-1 text-xs text-amber-600">同步客户档案余额，避免客户中心与应收款看板脱节</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-500">重复客户线索</p>
                <p className="mt-2 text-2xl font-semibold text-sky-700">{activeAudit.duplicateClientCount}</p>
                <p className="mt-1 text-xs text-sky-600">按手机号提示疑似重复客户，保留人工判断</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-500">可自动修复</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{activeAudit.autoFixableCount}</p>
                <p className="mt-1 text-xs text-emerald-600">一键重算订单应收并回填客户余额，扫描时间 {activeAudit.scannedAt.slice(0, 16).replace("T", " ")}</p>
              </div>
            </div>
          </PanelCard>
        </div>
      )}

      {showOfficeTransferModal && sub === "cash" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">办公室转入 / 转出</h3>
                <p className="mt-1 text-sm text-slate-500">这里只记录办公室抽屉里的现金进出，不影响公司总账。</p>
              </div>
              <button onClick={() => setShowOfficeTransferModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SmallSelect value={officeTransferDraft.type} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, type: v }))} options={["转入", "转出"]} />
              <SmallInput value={officeTransferDraft.amount} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" />
              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注（可选）" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowOfficeTransferModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addOfficeTransfer}>确认记录</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && sub === "expense" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">录入支出</h3>
                <p className="mt-1 text-sm text-slate-500">现金付款会自动补一条现金流水。</p>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <input list="expense-target-options" value={draft.target} onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} placeholder="对象 / 供应商 / 员工" className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none" />
                <datalist id="expense-target-options">{officeTargets.map((item) => <option key={item} value={item} />)}</datalist>
              </div>
              <SmallInput value={draft.detail} onChange={(v) => setDraft((d) => ({ ...d, detail: v }))} placeholder="支出明细" />
              <SmallInput value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" />
              <SmallSelect value={draft.expense_type} onChange={(v) => setDraft((d) => ({ ...d, expense_type: v }))} options={expenseTypeOptions} />
              <SmallSelect value={draft.payment_method} onChange={(v) => setDraft((d) => ({ ...d, payment_method: v }))} options={PAYMENT_METHODS} />
              <SmallInput value={draft.expense_date} onChange={(v) => setDraft((d) => ({ ...d, expense_date: v }))} type="date" />
            </div>
            <div className="mt-2"><SmallInput value={draft.remark} onChange={(v) => setDraft((d) => ({ ...d, remark: v }))} placeholder="备注（可选）" /></div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={expenseFromOffice} onChange={(e) => setExpenseFromOffice(e.target.checked)} /> 这笔支出从办公室抽屉里出</label>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowExpenseModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addExpense}>确认录入</ActionBtn>
            </div>
          </div>
        </div>
      )}
      {sub === "income" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">订单号</th><th className="px-4 py-2.5 font-semibold text-slate-600">客户</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">支付方式</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">明细</th></tr></thead><tbody>{filteredPaymentRows.length ? filteredPaymentRows.map(({ key, order, record }) => <tr key={key} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{order.order_number}</td><td className="px-4 py-2.5 text-slate-700">{order.client_name}</td><td className={`px-4 py-2.5 font-semibold ${record.type === "refund" ? "text-rose-600" : "text-green-600"}`}>{record.type === "refund" ? "-" : "+"}{formatMoney(record.amount)}</td><td className="px-4 py-2.5 text-slate-600">{record.method}</td><td className="px-4 py-2.5 text-slate-500">{record.date}</td><td className="px-4 py-2.5 text-slate-500">{record.note ?? "-"}</td></tr>) : <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">这个日期范围内没有收入记录</td></tr>}</tbody></table></div>}
      {sub === "expense" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">对象</th><th className="px-4 py-2.5 font-semibold text-slate-600">明细</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">类型</th><th className="px-4 py-2.5 font-semibold text-slate-600">方式</th><th className="px-4 py-2.5 font-semibold text-slate-600">办公室</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">操作</th></tr></thead><tbody>{filteredExpenses.length ? filteredExpenses.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 text-slate-700">{item.target}</td><td className="px-4 py-2.5 text-slate-500">{item.detail}</td><td className="px-4 py-2.5 font-semibold text-rose-600">{formatMoney(item.amount)}</td><td className="px-4 py-2.5 text-slate-600">{item.expense_type}</td><td className="px-4 py-2.5 text-slate-600">{item.payment_method}</td><td className="px-4 py-2.5 text-slate-600">{item.office ? "是" : "否"}</td><td className="px-4 py-2.5 text-slate-500">{item.expense_date}</td><td className="px-4 py-2.5"><div className="flex items-center gap-2">{confirmingExpenseId === item.id ? <><button onClick={() => deleteExpense(item.id)} className="rounded border border-red-400 bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingExpenseId(null)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingExpenseId(item.id)} className="rounded border border-red-100 px-2 py-0.5 text-xs text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors">删除</button>}</div></td></tr>) : <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">这个日期范围内没有支出记录</td></tr>}</tbody></table></div>}
      {sub === "cash" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">类型</th><th className="px-4 py-2.5 font-semibold text-slate-600">金额</th><th className="px-4 py-2.5 font-semibold text-slate-600">日期</th><th className="px-4 py-2.5 font-semibold text-slate-600">备注</th></tr></thead><tbody>{filteredCashEntries.length ? filteredCashEntries.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.type === "收入" ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"}`}>{item.type}</span></td><td className={`px-4 py-2.5 font-semibold ${item.type === "收入" ? "text-green-600" : "text-rose-600"}`}>{formatMoney(item.amount)}</td><td className="px-4 py-2.5 text-slate-500">{item.date}</td><td className="px-4 py-2.5 text-slate-500">{item.note ?? "-"}</td></tr>) : <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-400">这个日期范围内没有现金流水</td></tr>}</tbody></table></div>}
      {sub === "ledger" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">月份</th><th className="px-4 py-2.5 font-semibold text-slate-600">收入</th><th className="px-4 py-2.5 font-semibold text-slate-600">支出</th><th className="px-4 py-2.5 font-semibold text-slate-600">净额</th><th className="px-4 py-2.5 font-semibold text-slate-600">工资</th><th className="px-4 py-2.5 font-semibold text-slate-600">净利润</th></tr></thead><tbody>{ledgerRows.map((item) => <tr key={item.month} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.month}</td><td className="px-4 py-2.5 text-green-600">{formatMoney(item.income)}</td><td className="px-4 py-2.5 text-rose-600">{formatMoney(item.expense)}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.net)}</td><td className="px-4 py-2.5 text-amber-600">{formatMoney(item.wage)}</td><td className={`px-4 py-2.5 font-semibold ${item.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatMoney(item.profit)}</td></tr>)}</tbody></table></div>}
      {sub === "receivables" && (
        <div className="space-y-3">
          {filteredReceivableOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">暂无未收款订单</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2.5 font-semibold text-slate-600">客户</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">订单号</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">总额</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">已付</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">余款</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">下单日期</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">账龄</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivableOrders.map((o) => {
                    const agingDays = diffReceivableDays(o.order_date);
                    const agingBucket = getReceivableBucket(agingDays);
                    const isExpanded = quickPayTarget === o.order_number;
                    return (
                      <>
                        <tr key={o.order_number} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-slate-700">{o.client_name}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-700">{o.order_number}</td>
                          <td className="px-4 py-2.5 text-slate-700">{formatMoney(o.total_after_tax ?? o.total_price ?? 0)}</td>
                          <td className="px-4 py-2.5 font-medium text-green-600">{formatMoney(o.amount_paid ?? 0)}</td>
                          <td className="px-4 py-2.5 font-semibold text-red-600">{formatMoney(o.balance ?? 0)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{o.order_date || "-"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${agingBucket.tone}`}>
                              {agingDays}天
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  setQuickPayTarget(null);
                                } else {
                                  setQuickPayTarget(o.order_number);
                                  setQuickPayFields({ date: today, amount: String(o.balance ?? ""), method: "现金", note: "", office: false });
                                }
                              }}
                              className={`rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors ${isExpanded ? "border-slate-300 bg-slate-100 text-slate-600" : "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                            >
                              {isExpanded ? "收起" : "收款"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${o.order_number}-qp`} className="border-b border-emerald-100 bg-emerald-50/50">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="flex flex-wrap items-end gap-2">
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">日期</label>
                                  <input
                                    type="date"
                                    value={quickPayFields.date}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, date: e.target.value }))}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">金额 <span className="text-rose-500">*</span></label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="0.00"
                                    value={quickPayFields.amount}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, amount: e.target.value }))}
                                    className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">方式</label>
                                  <select
                                    value={quickPayFields.method}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, method: e.target.value }))}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  >
                                    {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div className="flex-1 min-w-[120px]">
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">备注</label>
                                  <input
                                    type="text"
                                    placeholder="可选"
                                    value={quickPayFields.note}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, note: e.target.value }))}
                                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={quickPayFields.office} onChange={(e) => setQuickPayFields((prev) => ({ ...prev, office: e.target.checked }))} /> 进入办公室</label>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleQuickPay(o.order_number)}
                                    disabled={!quickPayFields.amount || Number(quickPayFields.amount) <= 0}
                                    className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    确认收款
                                  </button>
                                  <button
                                    onClick={() => setQuickPayTarget(null)}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:border-slate-400 transition-colors"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {sub === "audit" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5 font-semibold text-slate-600">类型</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">对象</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">问题</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">当前值</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">建议值</th>
                </tr>
              </thead>
              <tbody>
                {activeAudit.issues.length ? activeAudit.issues.map((item) => (
                  item.kind === "duplicate_client" ? (
                    <tr key={`dup-${item.key}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2.5"><span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">重复客户</span></td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{item.clientNames.join(" / ")}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.issue}</td>
                      <td className="px-4 py-2.5 text-slate-500">手机号 {item.key}</td>
                      <td className="px-4 py-2.5 text-slate-500">请人工合并或保留</td>
                    </tr>
                  ) : (
                    <tr key={`${item.kind}-${item.kind === "order" ? item.orderNumber : item.clientId}-${item.issue}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.kind === "order" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{item.kind === "order" ? "订单" : "客户"}</span></td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{item.kind === "order" ? `${item.orderNumber} / ${item.clientName}` : item.clientName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.issue}</td>
                      <td className="px-4 py-2.5 text-slate-500">{item.currentValue}</td>
                      <td className="px-4 py-2.5 font-medium text-emerald-700">{item.suggestedValue}</td>
                    </tr>
                  )
                )) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-emerald-600">当前没有发现财务异常，可以放心继续收款与对账。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            <p>自动修复范围：重算订单已付金额、余款、状态，并同步客户档案余额。重复客户仅做提示，不自动删除，避免误伤真实共享电话的家庭或公司客户。</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

type ContactSub = "clients" | "suppliers";

function ClientsSection({ clients, setClients, suppliers, setSuppliers, orders, setOrders, appointments, setAppointments, setCashEntries, purchases, setPurchases, settings, onCreateAppointment }: { clients: ContactRecord[]; setClients: React.Dispatch<React.SetStateAction<ContactRecord[]>>; suppliers: SupplierRecord[]; setSuppliers: React.Dispatch<React.SetStateAction<SupplierRecord[]>>; orders: BizOrder[]; setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>; appointments: MeasurementAppointmentRecord[]; setAppointments: React.Dispatch<React.SetStateAction<MeasurementAppointmentRecord[]>>; setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>; purchases: PurchaseRecord[]; setPurchases: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>; settings: BizSettings; onCreateAppointment: (client: ContactRecord) => void; }) {
  const [sub, setSub] = useState<ContactSub>("clients");
  const today = new Date().toISOString().slice(0, 10);
  const [clientDraft, setClientDraft] = useState({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
  const supplierCategoryOptions = useMemo(() => getSupplierCategoryOptions(settings), [settings]);
  const [supplierDraft, setSupplierDraft] = useState({ name: "", category: supplierCategoryOptions[0] ?? "布料", contact_person: "", phone: "", email: "", website: "", address: "", remark: "" });
  const [supplierPurchaseDraft, setSupplierPurchaseDraft] = useState({ supplier: suppliers[0]?.name ?? "", detail: "", amount: "", payment_method: "转账", purchase_date: today, office: false, note: "" });
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [confirmingClientId, setConfirmingClientId] = useState<string | null>(null);
  const [confirmingSupplierId, setConfirmingSupplierId] = useState<string | null>(null);
  const [showSupplierPurchaseModal, setShowSupplierPurchaseModal] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? "");
  const [quickCollectDraft, setQuickCollectDraft] = useState({ orderNumber: "", amount: "", date: today, method: "现金", note: "", office: false });
  const contactConfigs: Record<ContactSub, SplitTabularSchemaConfig> = {
    clients: {
      title: "Client Directory",
      filePrefix: "biz-clients",
      exportColumns: ["Client Name", "Contact", "Phone", "Email/WeChat", "Address", "Created At", "Note", "VIP", "Balance"],
      printColumns: ["Client Name", "Contact", "Phone", "Email/WeChat", "Address", "Created At", "Note"],
      exportRows: () => mapRows(clients, (item) => [item.name, item.contact ?? "", item.phone ?? "", item.email ?? item.wechat ?? "", item.address ?? "", item.created_at ?? "", item.note ?? "", item.is_vip ? "Yes" : "No", item.balance ?? 0]),
      printRows: () => mapRows(clients, (item) => [item.name, item.contact ?? "-", item.phone ?? "-", item.email ?? item.wechat ?? "-", item.address ?? "-", item.created_at ?? "-", item.note ?? "-"]),
    },
    suppliers: {
      title: "Supplier Directory",
      filePrefix: "biz-suppliers",
      exportColumns: ["Supplier Name", "Category", "Contact", "Phone", "Address", "Last Purchase", "Remark"],
      printColumns: ["Supplier Name", "Category", "Contact", "Phone", "Address", "Last Purchase", "Remark"],
      exportRows: () => mapRows(suppliers, (item) => [item.name, item.category ?? "", item.contact_person ?? "", item.phone ?? "", item.address ?? "", item.last_purchase_date ?? "", item.remark ?? ""]),
      printRows: () => mapRows(suppliers, (item) => [item.name, item.category ?? "-", item.contact_person ?? "-", item.phone ?? "-", item.address ?? "-", item.last_purchase_date ?? "-", item.remark ?? "-"]),
    },
  };

  function exportContacts() {
    exportTabularSchema(contactConfigs[sub]);
  }

  function printContacts() {
    const config = contactConfigs[sub];
    printTabularSchema(config, `Total ${config.printRows().length}`);
  }

  function addClient() {
    if (!clientDraft.name.trim()) return;
    if (editingClientId) {
      const originalClient = clients.find((item) => item.id === editingClientId);
      const nextName = clientDraft.name.trim();
      const nextPhone = clientDraft.phone || undefined;
      const nextAddress = clientDraft.address || undefined;
      setClients((prev) => prev.map((item) => item.id === editingClientId ? { ...item, name: nextName, contact: clientDraft.contact || undefined, phone: nextPhone, wechat: clientDraft.wechat || undefined, address: nextAddress, note: clientDraft.note || undefined } : item));
      if (originalClient) {
        setOrders((prev) => prev.map((item) => item.client_name === originalClient.name || (!!originalClient.phone && item.phone === originalClient.phone) ? { ...item, client_name: nextName, phone: nextPhone, address: nextAddress } : item));
        setAppointments((prev) => prev.map((item) => item.client_id === originalClient.id || item.client_name === originalClient.name || (!!originalClient.phone && item.phone === originalClient.phone) ? { ...item, client_name: nextName, phone: nextPhone, address: nextAddress, client_id: originalClient.id } : item));
      }
      setSelectedClientId(editingClientId);
    } else {
      const newId = `CL-${String(clients.length + 1).padStart(3, "0")}`;
      setClients((prev) => [{ id: newId, name: clientDraft.name.trim(), contact: clientDraft.contact || undefined, phone: clientDraft.phone || undefined, wechat: clientDraft.wechat || undefined, address: clientDraft.address || undefined, note: clientDraft.note || undefined, created_at: today, balance: 0, is_vip: false }, ...prev]);
      setSelectedClientId(newId);
    }
    setEditingClientId(null);
    setClientDraft({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
    setShowClientModal(false);
  }

  function openEditClient(client: ContactRecord) {
    setEditingClientId(client.id);
    setClientDraft({ name: client.name, contact: client.contact ?? "", phone: client.phone ?? "", wechat: client.wechat ?? client.email ?? "", address: client.address ?? "", note: client.note ?? "" });
    setShowClientModal(true);
  }

  function deleteClient(client: ContactRecord) {
    setClients((prev) => prev.filter((item) => item.id !== client.id));
    if (selectedClientId === client.id) setSelectedClientId("");
    setConfirmingClientId(null);
  }

  function addSupplier() {
    if (!supplierDraft.name.trim()) return;
    if (editingSupplierId) {
      setSuppliers((prev) => prev.map((item) => item.id === editingSupplierId ? { ...item, name: supplierDraft.name.trim(), category: supplierDraft.category, contact_person: supplierDraft.contact_person || undefined, phone: supplierDraft.phone || undefined, email: supplierDraft.email || undefined, website: supplierDraft.website || undefined, address: supplierDraft.address || undefined, remark: supplierDraft.remark || undefined } : item));
    } else {
      setSuppliers((prev) => [{ id: `SUP-${String(prev.length + 1).padStart(3, "0")}`, name: supplierDraft.name.trim(), category: supplierDraft.category, contact_person: supplierDraft.contact_person || undefined, phone: supplierDraft.phone || undefined, email: supplierDraft.email || undefined, website: supplierDraft.website || undefined, address: supplierDraft.address || undefined, remark: supplierDraft.remark || undefined, last_purchase_date: today }, ...prev]);
    }
    setSupplierDraft({ name: "", category: supplierCategoryOptions[0] ?? "布料", contact_person: "", phone: "", email: "", website: "", address: "", remark: "" });
    setEditingSupplierId(null);
    setShowSupplierModal(false);
  }

  function openEditSupplier(supplier: SupplierRecord) {
    setEditingSupplierId(supplier.id);
    setSupplierDraft({ name: supplier.name, category: supplier.category ?? supplierCategoryOptions[0] ?? "布料", contact_person: supplier.contact_person ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "", website: supplier.website ?? "", address: supplier.address ?? "", remark: supplier.remark ?? "" });
    setShowSupplierModal(true);
  }

  function deleteSupplier(supplier: SupplierRecord) {
    setSuppliers((prev) => prev.filter((item) => item.id !== supplier.id));
    setConfirmingSupplierId(null);
  }

  function openSupplierPurchase(supplier: SupplierRecord) {
    setSupplierPurchaseDraft({ supplier: supplier.name, detail: "", amount: "", payment_method: "转账", purchase_date: today, office: false, note: "" });
    setShowSupplierPurchaseModal(true);
  }

  function addSupplierPurchase() {
    const amount = Number(supplierPurchaseDraft.amount) || 0;
    if (!supplierPurchaseDraft.supplier || amount <= 0) return;
    setPurchases((prev) => [{ id: `PO-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, supplier: supplierPurchaseDraft.supplier, item_name: supplierPurchaseDraft.detail.trim() || "采购支出", quantity: 1, unit: "笔", unit_price: amount, total_amount: amount, purchase_date: supplierPurchaseDraft.purchase_date, status: supplierPurchaseDraft.payment_method }, ...prev]);
    if (supplierPurchaseDraft.office) {
      setCashEntries((prev) => [{ id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, type: "转出", amount, date: supplierPurchaseDraft.purchase_date, note: supplierPurchaseDraft.note || `${supplierPurchaseDraft.supplier} 采购支出` }, ...prev]);
    }
    setShowSupplierPurchaseModal(false);
  }

  const filteredClients = clients.filter((item) => {
    const keyword = clientSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [item.name, item.contact, item.phone, item.email, item.wechat, item.address, item.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
  const clientPageSize = 10;
  const clientPageCount = Math.max(1, Math.ceil(filteredClients.length / clientPageSize));
  const pagedClients = filteredClients.slice((clientPage - 1) * clientPageSize, clientPage * clientPageSize);

  const resolvedSelectedClientId = selectedClientId && clients.some((item) => item.id === selectedClientId)
    ? selectedClientId
    : filteredClients[0]?.id ?? clients[0]?.id ?? "";
  const selectedClient = filteredClients.find((item) => item.id === resolvedSelectedClientId) ?? clients.find((item) => item.id === resolvedSelectedClientId) ?? filteredClients[0] ?? clients[0] ?? null;
  const selectedClientOrders = selectedClient
    ? [...orders]
        .filter((item) => item.client_name === selectedClient.name || (!!selectedClient.phone && item.phone === selectedClient.phone))
        .sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")))
    : [];
  const selectedClientAppointments = selectedClient
    ? [...appointments]
        .filter((item) => item.client_id === selectedClient.id || item.client_name === selectedClient.name || (!!selectedClient.phone && item.phone === selectedClient.phone))
        .sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)))
    : [];
  const clientTotal = selectedClientOrders.reduce((sum, item) => sum + (item.total_after_tax ?? item.total_price ?? 0), 0);
  const clientPaid = selectedClientOrders.reduce((sum, item) => sum + (item.amount_paid ?? 0), 0);
  const clientBalance = selectedClientOrders.reduce((sum, item) => sum + (item.balance ?? 0), 0);
  const receivableOrders = selectedClientOrders.filter((item) => (item.balance ?? 0) > 0 && item.status !== "已关闭");
  const selectedCollectOrder = receivableOrders.find((item) => item.order_number === quickCollectDraft.orderNumber) ?? receivableOrders[0] ?? null;
  const clientOrderCountWithBalance = selectedClientOrders.filter((item) => (item.balance ?? 0) > 0).length;
  const clientCustomOrderCount = selectedClientOrders.filter((item) => item.order_type !== "批发单").length;
  const clientWholesaleOrderCount = selectedClientOrders.filter((item) => item.order_type === "批发单").length;
  const clientLastOrder = selectedClientOrders[0]?.order_date ?? "-";
  const nextAppointment = [...selectedClientAppointments].filter((item) => getAppointmentStatus(item.appointment_date) !== "已完成").sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)))[0];
  const clientRecentPayments = selectedClientOrders
    .flatMap((order) => (order.payment_history ?? []).map((record) => ({
      ...record,
      order_number: order.order_number,
      order_status: order.status ?? "-",
    })))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const clientLastPayment = clientRecentPayments.find((item) => item.type === "payment");
  const clientBusinessFeed = [
    ...selectedClientOrders.map((item) => ({
      key: `order-${item.order_number}`,
      date: item.order_date ?? "",
      label: `订单 ${item.order_number}`,
      detail: `${item.order_type} · ${item.status ?? "-"} · ${formatMoney(item.total_after_tax ?? item.total_price ?? 0)}`,
      tone: "text-slate-700",
    })),
    ...selectedClientAppointments.map((item) => ({
      key: `appointment-${item.id}`,
      date: item.appointment_date,
      label: "预约",
      detail: `${formatAppointmentDate(item.appointment_date)} · ${item.address ?? "未填写地址"}`,
      tone: "text-sky-700",
    })),
    ...clientRecentPayments.map((item, index) => ({
      key: `payment-${item.order_number}-${index}-${item.date}`,
      date: item.date,
      label: item.type === "refund" ? `退款 ${item.order_number}` : `收款 ${item.order_number}`,
      detail: `${item.method} · ${formatMoney(item.amount)}${item.note ? ` · ${item.note}` : ""}`,
      tone: item.type === "refund" ? "text-rose-700" : "text-emerald-700",
    })),
  ]
    .filter((item) => item.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
  }

  function toggleVip(clientId: string) {
    setClients((prev) => prev.map((item) => item.id === clientId ? { ...item, is_vip: !item.is_vip } : item));
  }

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch]);

  useEffect(() => {
    if (clientPage > clientPageCount) setClientPage(clientPageCount);
  }, [clientPage, clientPageCount]);

  useEffect(() => {
    if (!selectedClient) {
      setQuickCollectDraft((prev) => ({ ...prev, orderNumber: "", amount: "" }));
      return;
    }
    const firstReceivable = receivableOrders[0];
    setQuickCollectDraft((prev) => {
      const hasCurrentOrder = receivableOrders.some((item) => item.order_number === prev.orderNumber);
      const nextOrder = hasCurrentOrder ? receivableOrders.find((item) => item.order_number === prev.orderNumber) : firstReceivable;
      return {
        ...prev,
        orderNumber: nextOrder?.order_number ?? "",
        amount: nextOrder ? String(nextOrder.balance ?? "") : "",
      };
    });
  }, [selectedClient?.id, orders]);

  function applyQuickCollectPreset(mode: "balance" | "half", order = selectedCollectOrder) {
    if (!order) return;
    const balance = Math.max(0, order.balance ?? 0);
    const nextAmount = mode === "balance" ? balance : Number((balance / 2).toFixed(2));
    setQuickCollectDraft((prev) => ({
      ...prev,
      orderNumber: order.order_number,
      amount: nextAmount > 0 ? String(nextAmount) : "",
      note: mode === "balance" ? "客户中心快速收尾款" : "客户中心快速收部分尾款",
    }));
  }

  function handleQuickCollect() {
    if (!selectedClient || !selectedCollectOrder) return;
    const amount = Number(quickCollectDraft.amount) || 0;
    const currentBalance = Math.max(0, selectedCollectOrder.balance ?? 0);
    if (amount <= 0 || amount > currentBalance || !quickCollectDraft.date) return;

    const paymentRecord: PaymentRecord = {
      date: quickCollectDraft.date,
      amount: Number(amount.toFixed(2)),
      method: quickCollectDraft.method,
      note: quickCollectDraft.note.trim() || (amount >= currentBalance ? "客户中心收清尾款" : "客户中心录入收款"),
      type: "payment",
      office: quickCollectDraft.office,
    };

    const nextOrders = orders.map((order) => {
      if (order.order_number !== selectedCollectOrder.order_number) return order;
      const paymentHistory = [paymentRecord, ...(order.payment_history ?? [])];
      const totalAfterTax = getOrderTotalForAudit(order);
      const amountPaid = Math.max(0, getOrderPaymentNet({ ...order, payment_history: paymentHistory }));
      const balance = Math.max(0, totalAfterTax - amountPaid);
      return {
        ...order,
        payment_history: paymentHistory,
        amount_paid: Number(amountPaid.toFixed(2)),
        balance: Number(balance.toFixed(2)),
        status: deriveStatus(totalAfterTax, amountPaid, order.status ?? "下单"),
      };
    });

    const repaired = applyFinanceAuditRepairs(nextOrders, clients);
    setOrders(repaired.fixedOrders);
    setClients(repaired.fixedClients);
    if (quickCollectDraft.office) {
      setCashEntries((prev) => [{
        id: `CASH-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`,
        type: "收入",
        amount: Number(amount.toFixed(2)),
        date: quickCollectDraft.date,
        note: `${selectedClient.name} ${selectedCollectOrder.order_number} 收款`,
      }, ...prev]);
    }
    setQuickCollectDraft((prev) => ({
      ...prev,
      orderNumber: "",
      amount: "",
      date: today,
      note: "",
      office: false,
    }));
  }

  return (
    <div>
      <SectionHeader
        eyebrow="客户管理"
        title="客户与供应商"
        actions={
          <>
            <ActionBtn onClick={exportContacts}>导出当前表</ActionBtn>
            <ActionBtn onClick={printContacts}>打印当前表</ActionBtn>
            <ActionBtn tone="primary" onClick={() => sub === "clients" ? (setEditingClientId(null), setClientDraft({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" }), setShowClientModal(true)) : setShowSupplierModal(true)}>
              + 新建{sub === "clients" ? "客户" : "供应商"}
            </ActionBtn>
          </>
        }
      />

      <StatStrip
        items={[
          { label: "客户数", value: String(clients.length) },
          { label: "VIP客户", value: String(clients.filter((item) => item.is_vip).length), accent: "text-sky-600" },
          { label: "供应商数", value: String(suppliers.length) },
          { label: "有欠款客户", value: String(clients.filter((item) => (item.balance ?? 0) > 0).length), accent: "text-amber-600" },
        ]}
      />

      <SegmentedControl options={[{ key: "clients", label: "客户档案" }, { key: "suppliers", label: "供应商" }]} value={sub} onChange={setSub} />

      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{editingClientId ? "编辑客户" : "新建客户"}</h3>
                <p className="mt-1 text-sm text-slate-500">客户资料现在支持直接新增和编辑。</p>
              </div>
              <button onClick={() => setShowClientModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <SmallInput value={clientDraft.name} onChange={(v) => setClientDraft((d) => ({ ...d, name: v }))} placeholder="客户名称" />
              <SmallInput value={clientDraft.contact} onChange={(v) => setClientDraft((d) => ({ ...d, contact: v }))} placeholder="联系人" />
              <SmallInput value={clientDraft.phone} onChange={(v) => setClientDraft((d) => ({ ...d, phone: v }))} placeholder="电话" />
              <SmallInput value={clientDraft.wechat} onChange={(v) => setClientDraft((d) => ({ ...d, wechat: v }))} placeholder="微信 / 邮箱" />
              <SmallInput value={clientDraft.address} onChange={(v) => setClientDraft((d) => ({ ...d, address: v }))} placeholder="地址" />
              <SmallInput value={clientDraft.note} onChange={(v) => setClientDraft((d) => ({ ...d, note: v }))} placeholder="备注" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowClientModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addClient}>{editingClientId ? "确认保存" : "确认新建"}</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{editingSupplierId ? "编辑供应商" : "新建供应商"}</h3>
                <p className="mt-1 text-sm text-slate-500">供应商资料现在也支持直接新增和编辑。</p>
              </div>
              <button onClick={() => setShowSupplierModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SmallInput value={supplierDraft.name} onChange={(v) => setSupplierDraft((d) => ({ ...d, name: v }))} placeholder="供应商名称" />
              <SmallSelect value={supplierDraft.category} onChange={(v) => setSupplierDraft((d) => ({ ...d, category: v }))} options={supplierCategoryOptions} />
              <SmallInput value={supplierDraft.contact_person} onChange={(v) => setSupplierDraft((d) => ({ ...d, contact_person: v }))} placeholder="联系人" />
              <SmallInput value={supplierDraft.phone} onChange={(v) => setSupplierDraft((d) => ({ ...d, phone: v }))} placeholder="电话" />
              <SmallInput value={supplierDraft.email} onChange={(v) => setSupplierDraft((d) => ({ ...d, email: v }))} placeholder="Email" />
              <SmallInput value={supplierDraft.website} onChange={(v) => setSupplierDraft((d) => ({ ...d, website: v }))} placeholder="网站" />
              <SmallInput value={supplierDraft.address} onChange={(v) => setSupplierDraft((d) => ({ ...d, address: v }))} placeholder="地址" />
              <SmallInput value={supplierDraft.remark} onChange={(v) => setSupplierDraft((d) => ({ ...d, remark: v }))} placeholder="备注" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowSupplierModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addSupplier}>{editingSupplierId ? "确认保存" : "确认新建"}</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {showSupplierPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">新建采购</h3>
                <p className="mt-1 text-sm text-slate-500">可以直接从供应商这里录采购，也可以选择是否从办公室抽屉里出钱。</p>
              </div>
              <button onClick={() => setShowSupplierPurchaseModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <SmallInput value={supplierPurchaseDraft.supplier} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, supplier: v }))} placeholder="供应商" />
              <SmallInput value={supplierPurchaseDraft.detail} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, detail: v }))} placeholder="采购明细" />
              <SmallInput value={supplierPurchaseDraft.amount} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="总价" />
              <SmallSelect value={supplierPurchaseDraft.payment_method} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, payment_method: v }))} options={PAYMENT_METHODS} />
              <SmallInput value={supplierPurchaseDraft.purchase_date} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, purchase_date: v }))} type="date" />
            </div>
            <div className="mt-2"><SmallInput value={supplierPurchaseDraft.note} onChange={(v) => setSupplierPurchaseDraft((d) => ({ ...d, note: v }))} placeholder="备注（可选）" /></div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={supplierPurchaseDraft.office} onChange={(e) => setSupplierPurchaseDraft((d) => ({ ...d, office: e.target.checked }))} /> 这笔采购从办公室抽屉里转出</label>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowSupplierPurchaseModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addSupplierPurchase}>确认新建</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {sub === "clients" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
            <PanelCard title="客户列表" note="点开一个客户后，就能在这里直接看订单、预约、收款情况、联系人和地址。">
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
                  <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="搜索客户 / 电话 / 地址" className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" />
                </div>
                <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {pagedClients.length ? pagedClients.map((item) => {
                    const itemOrders = orders.filter((order) => order.client_name === item.name || (!!item.phone && order.phone === item.phone));
                    const itemAppointments = appointments.filter((entry) => entry.client_id === item.id || entry.client_name === item.name || (!!item.phone && entry.phone === item.phone));
                    const itemBalance = itemOrders.reduce((sum, order) => sum + (order.balance ?? 0), 0);
                    const isActive = selectedClient?.id === item.id;
                    return (
                      <button key={item.id} onClick={() => selectClient(item.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${isActive ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                              {item.is_vip ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">VIP</span> : null}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">{item.phone ?? item.contact ?? "暂未填写联系方式"}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${itemBalance > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {itemBalance > 0 ? `欠款 ${formatMoney(itemBalance)}` : "已结清"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                          <span>{itemOrders.length} 个订单</span>
                          <span>{itemAppointments.length} 个预约</span>
                        </div>
                      </button>
                    );
                  }) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">没有匹配到客户</div>}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>第 {clientPage} / {clientPageCount} 页，共 {filteredClients.length} 个客户</span>
                  <div className="flex gap-2">
                    <ActionBtn onClick={() => setClientPage((prev) => Math.max(1, prev - 1))}>上一页</ActionBtn>
                    <ActionBtn onClick={() => setClientPage((prev) => Math.min(clientPageCount, prev + 1))}>下一页</ActionBtn>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title={selectedClient ? `客户详情 · ${selectedClient.name}` : "客户详情"} note="客户相关的业务状态、应收款、预约和联系资料，都直接在这里联动查看。">
              {selectedClient ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{selectedClient.name}</h3>
                        {selectedClient.is_vip ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">VIP客户</span> : null}
                        {clientBalance > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">待跟进</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">联系人 {selectedClient.contact ?? "-"}，电话 {selectedClient.phone ?? "-"}</p>
                      <p className="mt-1 text-xs text-slate-500">地址 {selectedClient.address ?? "未填写"}</p>
                      <p className="mt-1 text-xs text-slate-500">微信/邮箱 {selectedClient.wechat ?? selectedClient.email ?? "未填写"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionBtn onClick={() => toggleVip(selectedClient.id)}>{selectedClient.is_vip ? "取消VIP" : "设为VIP"}</ActionBtn>
                      <ActionBtn onClick={() => onCreateAppointment(selectedClient)}>+ 新建预约</ActionBtn>
                      <ActionBtn onClick={() => openEditClient(selectedClient)}>编辑客户</ActionBtn>
                      {confirmingClientId === selectedClient.id ? (
                        <>
                          <button onClick={() => deleteClient(selectedClient)} className="rounded-lg border border-red-500 bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors">确认删除</button>
                          <button onClick={() => setConfirmingClientId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 transition-colors">取消</button>
                        </>
                      ) : (
                        <ActionBtn tone="danger" onClick={() => setConfirmingClientId(selectedClient.id)}>删除客户</ActionBtn>
                      )}
                    </div>
                  </div>

                  <StatStrip
                    items={[
                      { label: "订单数", value: String(selectedClientOrders.length) },
                      { label: "定制 / 批发", value: `${clientCustomOrderCount} / ${clientWholesaleOrderCount}` },
                      { label: "业务总额", value: formatMoney(clientTotal), accent: "text-slate-800" },
                      { label: "已收 / 余款", value: `${formatMoney(clientPaid)} / ${formatMoney(clientBalance)}`, accent: clientBalance > 0 ? "text-amber-600" : "text-emerald-600" },
                    ]}
                  />

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">联系资料</p>
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="flex items-start justify-between gap-3"><span className="text-slate-500">主要联系人</span><span className="max-w-[190px] text-right font-medium text-slate-900">{selectedClient.contact ?? selectedClient.name}</span></div>
                        <div className="flex items-start justify-between gap-3"><span className="text-slate-500">电话</span><span className="max-w-[190px] text-right font-medium text-slate-900">{selectedClient.phone ?? "-"}</span></div>
                        <div className="flex items-start justify-between gap-3"><span className="text-slate-500">微信 / 邮箱</span><span className="max-w-[190px] text-right font-medium text-slate-900">{selectedClient.wechat ?? selectedClient.email ?? "-"}</span></div>
                        <div className="flex items-start justify-between gap-3"><span className="text-slate-500">地址</span><span className="max-w-[190px] text-right text-slate-900">{selectedClient.address ?? "未填写"}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">业务状态</p>
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="flex items-center justify-between"><span className="text-slate-500">最近下单</span><span className="font-medium text-slate-900">{clientLastOrder}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">下次预约</span><span className="max-w-[180px] text-right font-medium text-slate-900">{nextAppointment ? formatAppointmentDate(nextAppointment.appointment_date) : "暂无"}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">预约数</span><span className="font-medium text-slate-900">{selectedClientAppointments.length}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">备注</span><span className="max-w-[180px] text-right text-slate-900">{selectedClient.note ?? "-"}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">收款情况</p>
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="flex items-center justify-between"><span className="text-slate-500">未收余款</span><span className={`font-semibold ${clientBalance > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatMoney(clientBalance)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">未结清订单</span><span className="font-medium text-slate-900">{clientOrderCountWithBalance}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">最近收款</span><span className="max-w-[180px] text-right font-medium text-slate-900">{clientLastPayment ? `${clientLastPayment.date} · ${formatMoney(clientLastPayment.amount)}` : "暂无收款"}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">客户档案余额</span><span className="font-medium text-slate-900">{formatMoney(selectedClient.balance ?? clientBalance)}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">快速收款</p>
                            <p className="text-[11px] text-slate-400">选中未结清订单，录一次收款，就会立即同步客户余额。</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${receivableOrders.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {receivableOrders.length ? `${receivableOrders.length} 个未结清` : "全部结清"}
                          </span>
                        </div>
                        {receivableOrders.length ? (
                          <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-500">订单</label>
                                <select value={quickCollectDraft.orderNumber} onChange={(e) => {
                                  const nextOrder = receivableOrders.find((item) => item.order_number === e.target.value);
                                  setQuickCollectDraft((prev) => ({ ...prev, orderNumber: e.target.value, amount: nextOrder ? String(nextOrder.balance ?? "") : prev.amount }));
                                }} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700">
                                  {receivableOrders.map((item) => <option key={item.order_number} value={item.order_number}>{item.order_number} · {formatMoney(item.balance ?? 0)}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-500">金额</label>
                                <input type="number" min={0} step={0.01} value={quickCollectDraft.amount} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, amount: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="0.00" />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-500">日期</label>
                                <input type="date" value={quickCollectDraft.date} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, date: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-500">方式</label>
                                <select value={quickCollectDraft.method} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, method: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700">
                                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                              <div className="space-y-2">
                                <input type="text" value={quickCollectDraft.note} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, note: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="备注，比如送货时收尾款" />
                                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={quickCollectDraft.office} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, office: e.target.checked }))} /> 进入办公室</label>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <ActionBtn onClick={() => applyQuickCollectPreset("half")}>填一半</ActionBtn>
                                <ActionBtn onClick={() => applyQuickCollectPreset("balance")} tone="success">填全额余款</ActionBtn>
                                <ActionBtn onClick={handleQuickCollect} tone="primary">确认收款</ActionBtn>
                              </div>
                            </div>
                            {selectedCollectOrder ? (
                              <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-900">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <span className="font-semibold">{selectedCollectOrder.order_number}</span>
                                  <span>余款 {formatMoney(selectedCollectOrder.balance ?? 0)} · 已收 {formatMoney(selectedCollectOrder.amount_paid ?? 0)} / 总额 {formatMoney(selectedCollectOrder.total_after_tax ?? selectedCollectOrder.total_price ?? 0)}</span>
                                </div>
                              </div>
                            ) : null}
                            <div className="space-y-2">
                              {receivableOrders.slice(0, 4).map((item) => (
                                <button key={item.order_number} onClick={() => applyQuickCollectPreset("balance", item)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors ${selectedCollectOrder?.order_number === item.order_number ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}>
                                  <div>
                                    <p className="font-semibold text-slate-800">{item.order_number}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{item.order_date ?? "-"} · {item.status ?? "-"}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-amber-600">{formatMoney(item.balance ?? 0)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">点一下填满全部余款</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-emerald-600">这个客户当前没有未收款订单</div>}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-900">关联订单</p>
                          <span className="text-[11px] text-slate-400">状态、应收和已收金额会保持联动</span>
                        </div>
                        {selectedClientOrders.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                  <th className="px-3 py-2 font-semibold text-slate-600">订单号</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">类型</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">总额</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">已收</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">余款</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedClientOrders.slice(0, 8).map((item) => (
                                  <tr key={item.order_number} className="border-b border-slate-100 last:border-b-0">
                                    <td className="px-3 py-2 font-medium text-slate-700">{item.order_number}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.order_type}</td>
                                    <td className="px-3 py-2 text-slate-500">{item.order_date ?? "-"}</td>
                                    <td className="px-3 py-2 text-slate-700">{formatMoney(item.total_after_tax ?? item.total_price ?? 0)}</td>
                                    <td className="px-3 py-2 text-emerald-600">{formatMoney(item.amount_paid ?? 0)}</td>
                                    <td className={`px-3 py-2 font-semibold ${(item.balance ?? 0) > 0 ? "text-amber-600" : "text-slate-700"}`}>{formatMoney(item.balance ?? 0)}</td>
                                    <td className="px-3 py-2 text-slate-600">
                                      {(item.balance ?? 0) > 0 ? <button onClick={() => applyQuickCollectPreset("balance", item)} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">收清余款</button> : <span className="text-[11px] text-emerald-600">已结清</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">这个客户还没有关联订单</div>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">最近收款</p>
                        <span className="text-[11px] text-slate-400">从关联订单里自动汇总</span>
                      </div>
                      {clientRecentPayments.length ? (
                        <div className="space-y-2">
                          {clientRecentPayments.slice(0, 6).map((item, index) => (
                            <div key={`${item.order_number}-${item.date}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-slate-800">{item.order_number}</span>
                                <span className={`text-xs font-semibold ${item.type === "refund" ? "text-rose-600" : "text-emerald-600"}`}>{item.type === "refund" ? "退款" : "收款"} {formatMoney(item.amount)}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">{item.date} · {item.method} · {item.order_status}</p>
                              <p className="mt-1 text-[11px] text-slate-400">{item.note ?? "无备注"}</p>
                            </div>
                          ))}
                        </div>
                      ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">暂时还没有收款记录</div>}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">预约记录</p>
                        <span className="text-[11px] text-slate-400">从客户详情联动过来</span>
                      </div>
                      {selectedClientAppointments.length ? (
                        <div className="space-y-2">
                          {selectedClientAppointments.slice(0, 5).map((item) => {
                            const status = getAppointmentStatus(item.appointment_date);
                            return (
                              <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-800">{formatAppointmentDate(item.appointment_date)}</span>
                                  <AppointmentStatusBadge status={status} />
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">{item.address ?? "未填写地址"}</p>
                                <p className="mt-1 text-[11px] text-slate-400">{item.description ?? "无备注"}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">暂时还没有预约记录</div>}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">业务时间线</p>
                        <span className="text-[11px] text-slate-400">订单、收款、预约放在一起看</span>
                      </div>
                      {clientBusinessFeed.length ? (
                        <div className="space-y-2">
                          {clientBusinessFeed.slice(0, 8).map((item) => (
                            <div key={item.key} className="rounded-lg border border-slate-200 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-semibold ${item.tone}`}>{item.label}</span>
                                <span className="text-[11px] text-slate-400">{item.date}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
                            </div>
                          ))}
                        </div>
                      ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">暂时还没有关联动态</div>}
                    </div>
                  </div>
                </div>
              ) : <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">请先在左侧选择一个客户，再看详情</div>}
            </PanelCard>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5 font-semibold text-slate-600">供应商名称</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">分类</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">联系人</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">电话</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">网站</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">地址</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">最近采购</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{item.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.category ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.contact_person ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.phone ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.email ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.website ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.address ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.last_purchase_date ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openSupplierPurchase(item)} className="rounded border border-emerald-100 px-2 py-1 text-[11px] text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-colors">新建采购</button>
                        <button onClick={() => openEditSupplier(item)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">编辑</button>
                        {confirmingSupplierId === item.id ? <><button onClick={() => deleteSupplier(item)} className="rounded border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingSupplierId(null)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingSupplierId(item.id)} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type MaterialSub = "inventory" | "purchases";

function normalizeInventoryToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[（【].*?[）】]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function inventoryNameMatches(material: MaterialRecord, candidateName: string) {
  const materialToken = normalizeInventoryToken(material.name);
  const candidateToken = normalizeInventoryToken(candidateName);
  if (!materialToken || !candidateToken) return false;
  return candidateToken.includes(materialToken) || materialToken.includes(candidateToken);
}

function findMaterialMatch(materials: MaterialRecord[], candidateName: string, unit?: string) {
  return materials.find((item) => {
    if (!inventoryNameMatches(item, candidateName)) return false;
    if (unit && item.unit && item.unit !== unit) return false;
    return true;
  });
}

type OrderMaterialAllocation = {
  orderNumber: string;
  clientName: string;
  orderDate?: string;
  orderStatus?: string;
  rowName: string;
  spec?: string;
  unit: string;
  requiredQty: number;
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  stockQty: number;
  availableBefore: number;
  availableAfter: number;
  shortageQty: number;
  matched: boolean;
};

type OrderMaterialInsight = {
  orderNumber: string;
  clientName: string;
  orderDate?: string;
  totalRows: number;
  matchedRows: number;
  shortageRows: number;
  missingRows: number;
  readyRows: number;
  totalShortageQty: number;
  allocations: OrderMaterialAllocation[];
};

function buildOrderMaterialInsights(materials: MaterialRecord[], orders: BizOrder[]) {
  const activeWholesaleOrders = [...orders]
    .filter((order) => order.order_type === "批发单" && order.status !== "已关闭")
    .sort((a, b) => {
      const left = `${a.order_date ?? "9999-99-99"}-${a.order_number}`;
      const right = `${b.order_date ?? "9999-99-99"}-${b.order_number}`;
      return left.localeCompare(right);
    });

  const remainingStock = new Map(materials.map((item) => [item.id, item.stock_quantity]));
  const byOrder = new Map<string, OrderMaterialInsight>();
  const byMaterial = new Map<string, OrderMaterialAllocation[]>();

  activeWholesaleOrders.forEach((order) => {
    const rows = order.material_rows ?? [];
    const allocations = rows.map((row) => {
      const matched = findMaterialMatch(materials, row.name, row.unit);
      if (!matched) {
        return {
          orderNumber: order.order_number,
          clientName: order.client_name,
          orderDate: order.order_date,
          orderStatus: order.status,
          rowName: row.name,
          spec: row.spec,
          unit: row.unit,
          requiredQty: row.qty,
          stockQty: 0,
          availableBefore: 0,
          availableAfter: 0,
          shortageQty: row.qty,
          matched: false,
        } satisfies OrderMaterialAllocation;
      }

      const availableBefore = remainingStock.get(matched.id) ?? matched.stock_quantity;
      const availableAfter = availableBefore - row.qty;
      const shortageQty = Math.max(0, row.qty - Math.max(0, availableBefore));
      remainingStock.set(matched.id, availableAfter);

      const allocation = {
        orderNumber: order.order_number,
        clientName: order.client_name,
        orderDate: order.order_date,
        orderStatus: order.status,
        rowName: row.name,
        spec: row.spec,
        unit: row.unit,
        requiredQty: row.qty,
        materialId: matched.id,
        materialCode: matched.code,
        materialName: matched.name,
        stockQty: matched.stock_quantity,
        availableBefore,
        availableAfter,
        shortageQty,
        matched: true,
      } satisfies OrderMaterialAllocation;

      const existing = byMaterial.get(matched.id) ?? [];
      existing.push(allocation);
      byMaterial.set(matched.id, existing);
      return allocation;
    });

    byOrder.set(order.order_number, {
      orderNumber: order.order_number,
      clientName: order.client_name,
      orderDate: order.order_date,
      totalRows: allocations.length,
      matchedRows: allocations.filter((item) => item.matched).length,
      shortageRows: allocations.filter((item) => item.shortageQty > 0).length,
      missingRows: allocations.filter((item) => !item.matched).length,
      readyRows: allocations.filter((item) => item.matched && item.shortageQty <= 0).length,
      totalShortageQty: allocations.reduce((sum, item) => sum + item.shortageQty, 0),
      allocations,
    });
  });

  return { byOrder, byMaterial };
}

function getCommittedMaterialMap(materials: MaterialRecord[], orders: BizOrder[]) {
  const committed = new Map<string, number>();

  orders
    .filter((order) => order.order_type === "批发单" && order.status !== "已关闭")
    .forEach((order) => {
      (order.material_rows ?? []).forEach((row) => {
        const matched = findMaterialMatch(materials, row.name, row.unit);
        if (!matched) return;
        committed.set(matched.id, (committed.get(matched.id) ?? 0) + row.qty);
      });
    });

  return committed;
}

function MaterialsSection({ materials, setMaterials, purchases, setPurchases, suppliers, orders }: { materials: MaterialRecord[]; setMaterials: React.Dispatch<React.SetStateAction<MaterialRecord[]>>; purchases: PurchaseRecord[]; setPurchases: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>; suppliers: SupplierRecord[]; orders: BizOrder[]; }) {
  const [sub, setSub] = useState<MaterialSub>("inventory");
  const today = new Date().toISOString().slice(0, 10);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [confirmingMaterialId, setConfirmingMaterialId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState({ code: "", name: "", specification: "", size: "", unit: "个", stock_quantity: "", factory_price_rmb: "", weight: "", usd_cost: "", sale_price_usd: "", vip_sale_price_usd: "", supplier: suppliers[0]?.name ?? "", image: "", remark: "" });
  const [purchaseDraft, setPurchaseDraft] = useState({ supplier: suppliers[0]?.name ?? "", item_name: "", quantity: "", unit: "个", unit_price: "", purchase_date: today, status: "未付款" });
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [inventoryHint, setInventoryHint] = useState("");
  const monthlyPurchase = purchases.filter((item) => item.purchase_date.startsWith(today.slice(0, 7))).reduce((sum, item) => sum + item.total_amount, 0);
  const inventoryRows = materials;
  const materialConfigs: Record<MaterialSub, SplitTabularSchemaConfig> = {
    inventory: {
      title: "库存清单",
      filePrefix: "biz-materials",
      exportColumns: ["编码", "名称", "规格", "尺寸", "总库存", "出厂价RMB", "美金成本USD", "卖出价USD", "VIP价USD", "单重", "供应商", "最近入库日期", "备注"],
      printColumns: ["编码", "名称", "规格", "尺寸", "总库存", "出厂价RMB", "美金成本USD", "卖出价USD", "VIP价USD", "供应商"],
      exportRows: () => mapRows(inventoryRows, (item) => [item.code, item.name, item.specification ?? "", item.size ?? "", item.stock_quantity, item.factory_price_rmb ?? 0, item.usd_cost ?? 0, item.sale_price_usd ?? 0, item.vip_sale_price_usd ?? 0, item.weight ?? 1, item.supplier ?? "", item.last_stock_date ?? "", item.remark ?? ""]),
      printRows: () => mapRows(inventoryRows, (item) => [item.code, item.name, item.specification ?? "-", item.size ?? "-", item.stock_quantity, item.factory_price_rmb ?? 0, item.usd_cost ?? 0, item.sale_price_usd ?? 0, item.vip_sale_price_usd ?? 0, item.supplier ?? "-"]),
    },
    purchases: {
      title: "采购记录",
      filePrefix: "biz-purchases",
      exportColumns: ["采购单号", "供应商", "品名", "数量", "单位", "单价", "总价", "采购日期", "状态"],
      printColumns: ["采购单号", "供应商", "品名", "数量", "单价", "总价", "采购日期", "状态"],
      exportRows: () => mapRows(purchases, (item) => [item.id, item.supplier, item.item_name, item.quantity, item.unit, item.unit_price, item.total_amount, item.purchase_date, item.status]),
      printRows: () => mapRows(purchases, (item) => [item.id, item.supplier, item.item_name, `${item.quantity} ${item.unit}`, formatMoney(item.unit_price), formatMoney(item.total_amount), item.purchase_date, item.status]),
    },
  };

  function exportMaterials() { exportTabularSchema(materialConfigs[sub]); }
  function printMaterials() { const config = materialConfigs[sub]; printTabularSchema(config, `共 ${config.printRows().length} 条`); }

  function resetMaterialDraft() {
    setMaterialDraft({ code: "", name: "", specification: "", size: "", unit: "个", stock_quantity: "", factory_price_rmb: "", weight: "", usd_cost: "", sale_price_usd: "", vip_sale_price_usd: "", supplier: suppliers[0]?.name ?? "", image: "", remark: "" });
    setEditingMaterialId(null);
  }

  function syncMaterialCosts(nextFactory: string, nextWeight: string, nextSale?: string, nextVip?: string) {
    const factory = Number(nextFactory) || 0;
    const weight = Number(nextWeight) || 1;
    const usd = calcUsdCost(factory, weight);
    setMaterialDraft((d) => ({ ...d, factory_price_rmb: nextFactory, weight: nextWeight, usd_cost: String(usd), sale_price_usd: nextSale ?? d.sale_price_usd, vip_sale_price_usd: nextVip ?? d.vip_sale_price_usd }));
  }

  function handleMaterialImageUpload(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMaterialDraft((d) => ({ ...d, image: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  function addMaterial() {
    if (!materialDraft.name.trim() || !materialDraft.code.trim()) return;
    const factoryPrice = Number(materialDraft.factory_price_rmb) || 0;
    const weight = Number(materialDraft.weight) || 1;
    const usdCost = Number(materialDraft.usd_cost) || calcUsdCost(factoryPrice, weight);
    const salePrice = Number(materialDraft.sale_price_usd) || 0;
    const vipPrice = Number(materialDraft.vip_sale_price_usd) || factoryPrice;
    const nextItem = { id: editingMaterialId || `MAT-${String(materials.length + 1).padStart(3, "0")}`, code: materialDraft.code.trim(), name: materialDraft.name.trim(), specification: materialDraft.specification || undefined, size: materialDraft.size || undefined, unit: materialDraft.unit, stock_quantity: Number(materialDraft.stock_quantity) || 0, min_stock: 0, factory_price_rmb: factoryPrice, usd_cost: usdCost, sale_price_usd: salePrice, vip_sale_price_usd: vipPrice, weight, purchase_price: usdCost, supplier: materialDraft.supplier || undefined, image: materialDraft.image || undefined, last_stock_date: today, remark: materialDraft.remark || undefined } satisfies MaterialRecord;
    if (editingMaterialId) {
      setMaterials((prev) => prev.map((item) => item.id === editingMaterialId ? nextItem : item));
      setInventoryHint(`已更新物料 ${nextItem.name}。`);
    } else {
      setMaterials((prev) => [nextItem, ...prev]);
      setInventoryHint(`已新增物料 ${nextItem.name}。`);
    }
    resetMaterialDraft();
    setShowMaterialModal(false);
  }

  function openEditMaterial(item: MaterialRecord) {
    setEditingMaterialId(item.id);
    setMaterialDraft({ code: item.code, name: item.name, specification: item.specification ?? "", size: item.size ?? "", unit: item.unit, stock_quantity: String(item.stock_quantity ?? 0), factory_price_rmb: String(item.factory_price_rmb ?? 0), weight: String(item.weight ?? 1), usd_cost: String(item.usd_cost ?? calcUsdCost(item.factory_price_rmb ?? 0, item.weight)), sale_price_usd: String(item.sale_price_usd ?? 0), vip_sale_price_usd: String(item.vip_sale_price_usd ?? item.factory_price_rmb ?? 0), supplier: item.supplier ?? suppliers[0]?.name ?? "", image: item.image ?? "", remark: item.remark ?? "" });
    setShowMaterialModal(true);
  }

  function deleteMaterial(id: string) {
    setMaterials((prev) => prev.filter((item) => item.id !== id));
    setConfirmingMaterialId(null);
  }

  function addPurchase() {
    const quantity = Number(purchaseDraft.quantity) || 0;
    const unitPrice = Number(purchaseDraft.unit_price) || 0;
    const itemName = purchaseDraft.item_name.trim();
    if (!itemName || quantity <= 0) return;
    setPurchases((prev) => [{ id: `PO-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, "0")}`, supplier: purchaseDraft.supplier || "未指定", item_name: itemName, quantity, unit: purchaseDraft.unit, unit_price: unitPrice, total_amount: quantity * unitPrice, purchase_date: purchaseDraft.purchase_date, status: purchaseDraft.status }, ...prev]);
    const matched = findMaterialMatch(materials, itemName, purchaseDraft.unit);
    if (matched) {
      setMaterials((prev) => prev.map((item) => item.id === matched.id ? { ...item, stock_quantity: item.stock_quantity + quantity, supplier: purchaseDraft.supplier || item.supplier, last_stock_date: purchaseDraft.purchase_date } : item));
      setInventoryHint(`采购单已入库，${matched.name} 总库存 +${quantity}。`);
    } else {
      setInventoryHint("采购单已记录，但没匹配到现有物料。你可以先补建物料。") ;
    }
    setPurchaseDraft({ supplier: suppliers[0]?.name ?? "", item_name: "", quantity: "", unit: "个", unit_price: "", purchase_date: today, status: "未付款" });
    setShowPurchaseModal(false);
  }

  return (
    <div>
      <SectionHeader eyebrow="Materials & Inventory" title="物料库存" actions={<><ActionBtn onClick={exportMaterials}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printMaterials}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={() => sub === "inventory" ? (resetMaterialDraft(), setShowMaterialModal(true)) : setShowPurchaseModal(true)}>+ {sub === "inventory" ? "新建物料" : "新建采购单"}</ActionBtn></>} />
      <StatStrip items={[{ label: "物料品类", value: String(materials.length) }, { label: "总库存", value: String(materials.reduce((sum, item) => sum + item.stock_quantity, 0)) }, { label: "本月采购额", value: formatMoney(monthlyPurchase), accent: "text-red-600" }, { label: "批发订单数", value: String(orders.filter((item) => item.order_type === "批发单" && item.status !== "已关闭").length), accent: "text-sky-600" }]} />
      <SegmentedControl options={[{ key: "inventory", label: "库存清单" }, { key: "purchases", label: "采购记录" }]} value={sub} onChange={setSub} />

      {inventoryHint ? <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">{inventoryHint}</div> : null}

      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{editingMaterialId ? "编辑物料" : "新建物料"}</h3>
                <p className="mt-1 text-sm text-slate-500">支持尺寸、单重、图片、出厂价、美金成本、卖出价和 VIP 价。</p>
              </div>
              <button onClick={() => setShowMaterialModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SmallInput value={materialDraft.code} onChange={(v) => setMaterialDraft((d) => ({ ...d, code: v }))} placeholder="编码" />
              <SmallInput value={materialDraft.name} onChange={(v) => setMaterialDraft((d) => ({ ...d, name: v }))} placeholder="名称" />
              <SmallInput value={materialDraft.specification} onChange={(v) => setMaterialDraft((d) => ({ ...d, specification: v }))} placeholder="规格" />
              <SmallInput value={materialDraft.size} onChange={(v) => setMaterialDraft((d) => ({ ...d, size: v }))} placeholder="尺寸" />
              <SmallInput value={materialDraft.stock_quantity} onChange={(v) => setMaterialDraft((d) => ({ ...d, stock_quantity: v }))} type="number" placeholder="总库存" />
              <SmallInput value={materialDraft.factory_price_rmb} onChange={(v) => syncMaterialCosts(v, materialDraft.weight)} type="number" placeholder="出厂价 RMB" />
              <SmallInput value={materialDraft.weight} onChange={(v) => syncMaterialCosts(materialDraft.factory_price_rmb, v)} type="number" placeholder="单重（默认 1）" />
              <SmallInput value={materialDraft.usd_cost} onChange={(v) => setMaterialDraft((d) => ({ ...d, usd_cost: v }))} type="number" placeholder="美金成本 USD" />
              <SmallInput value={materialDraft.sale_price_usd} onChange={(v) => setMaterialDraft((d) => ({ ...d, sale_price_usd: v }))} type="number" placeholder="卖出价 USD" />
              <SmallInput value={materialDraft.vip_sale_price_usd} onChange={(v) => setMaterialDraft((d) => ({ ...d, vip_sale_price_usd: v }))} type="number" placeholder="VIP价 USD（默认出厂价）" />
              <SmallSelect value={materialDraft.unit} onChange={(v) => setMaterialDraft((d) => ({ ...d, unit: v }))} options={["个", "米", "根", "套", "张"]} />
              <SmallSelect value={materialDraft.supplier} onChange={(v) => setMaterialDraft((d) => ({ ...d, supplier: v }))} options={suppliers.length ? suppliers.map((item) => item.name) : ["未指定"]} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <SmallInput value={materialDraft.remark} onChange={(v) => setMaterialDraft((d) => ({ ...d, remark: v }))} placeholder="备注（可选）" />
                <label className="block rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">上传图片</span>
                  <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => handleMaterialImageUpload(e.target.files?.[0])} />
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">图片预览</p>
                {materialDraft.image ? <img src={materialDraft.image} alt="物料图片" className="mt-2 h-32 w-full rounded-lg object-cover" /> : <div className="mt-2 flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">暂无图片</div>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowMaterialModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addMaterial}>{editingMaterialId ? "确认保存" : "确认新建"}</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">新建采购单</h3>
                <p className="mt-1 text-sm text-slate-500">采购保存后会尝试自动回补对应物料的总库存。</p>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SmallSelect value={purchaseDraft.supplier} onChange={(v) => setPurchaseDraft((d) => ({ ...d, supplier: v }))} options={suppliers.length ? suppliers.map((item) => item.name) : ["未指定"]} />
              <SmallInput value={purchaseDraft.item_name} onChange={(v) => setPurchaseDraft((d) => ({ ...d, item_name: v }))} placeholder="品名" />
              <SmallInput value={purchaseDraft.quantity} onChange={(v) => setPurchaseDraft((d) => ({ ...d, quantity: v }))} type="number" placeholder="数量" />
              <SmallSelect value={purchaseDraft.unit} onChange={(v) => setPurchaseDraft((d) => ({ ...d, unit: v }))} options={["个", "米", "根", "套", "张"]} />
              <SmallInput value={purchaseDraft.unit_price} onChange={(v) => setPurchaseDraft((d) => ({ ...d, unit_price: v }))} type="number" placeholder="单价" />
              <SmallInput value={purchaseDraft.purchase_date} onChange={(v) => setPurchaseDraft((d) => ({ ...d, purchase_date: v }))} type="date" />
              <SmallSelect value={purchaseDraft.status} onChange={(v) => setPurchaseDraft((d) => ({ ...d, status: v }))} options={["未付款", "部分付款", "已付款"]} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowPurchaseModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addPurchase}>确认新建</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {sub === "inventory" ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5 font-semibold text-slate-600">图片</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">品名</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">规格</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">尺寸</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">总库存</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">出厂价 RMB</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">美金成本 USD</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">卖出价 USD</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">VIP价 USD</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">单重</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">供应商</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5">{item.image ? <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">暂无</div>}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{item.name}<div className="text-[11px] text-slate-400">{item.code}</div></td>
                    <td className="px-4 py-2.5 text-slate-600">{item.specification ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.size ?? "-"}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{item.stock_quantity}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.factory_price_rmb ?? 0}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.usd_cost ?? 0}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.sale_price_usd ?? 0}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.vip_sale_price_usd ?? item.factory_price_rmb ?? 0}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.weight ?? 1}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.supplier ?? "-"}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-2"><button onClick={() => openEditMaterial(item)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">编辑</button>{confirmingMaterialId === item.id ? <><button onClick={() => deleteMaterial(item.id)} className="rounded border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingMaterialId(null)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingMaterialId(item.id)} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5 font-semibold text-slate-600">采购单号</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">供应商</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">品名</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">数量</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">单价</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">总价</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">采购日期</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{item.id}</td>
                    <td className="px-4 py-2.5 text-slate-700">{item.supplier}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.item_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-2.5 text-slate-700">{formatMoney(item.unit_price)}</td>
                    <td className="px-4 py-2.5 font-semibold text-red-600">{formatMoney(item.total_amount)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.purchase_date}</td>
                    <td className="px-4 py-2.5 text-slate-600">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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

function AppointmentsSection({ appointments, setAppointments, clients, prefillClient, onPrefillConsumed }: { appointments: MeasurementAppointmentRecord[]; setAppointments: React.Dispatch<React.SetStateAction<MeasurementAppointmentRecord[]>>; clients: ContactRecord[]; prefillClient?: Partial<MeasurementAppointmentRecord> | null; onPrefillConsumed: () => void; }) {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [datePreset, setDatePreset] = useState("全部");
  const [rangeStart, setRangeStart] = useState(`${today}T00:00`);
  const [rangeEnd, setRangeEnd] = useState(`${tomorrow}T23:59`);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [confirmingAppointmentId, setConfirmingAppointmentId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");
  const [draft, setDraft] = useState({ client_id: "", client_name: "", phone: "", address: "", appointment_date: `${today}T10:00`, description: "" });

  const clientOptions = clients.map((item) => ({ value: item.id, label: item.name }));

  useEffect(() => {
    if (!prefillClient) return;
    setDraft((prev) => ({
      ...prev,
      client_id: prefillClient.client_id ?? "",
      client_name: prefillClient.client_name ?? "",
      phone: prefillClient.phone ?? "",
      address: prefillClient.address ?? "",
      appointment_date: prefillClient.appointment_date ?? `${todayIso()}T10:00`,
      description: prefillClient.description ?? "",
    }));
    setShowAppointmentModal(true);
    onPrefillConsumed();
  }, [onPrefillConsumed, prefillClient]);

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

  function hydrateFromClientName(name: string) {
    const client = clients.find((item) => item.name === name.trim());
    if (!client) {
      setDraft((prev) => ({ ...prev, client_name: name }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      client_id: client.id,
      client_name: client.name,
      phone: client.phone ?? prev.phone,
      address: client.address ?? prev.address,
    }));
  }

  function matchesDatePreset(appointmentDate: string) {
    const dateOnly = appointmentDate.slice(0, 10);
    if (datePreset === "全部") return true;
    if (datePreset === "今日") return dateOnly === today;
    if (datePreset === "明日") return dateOnly === tomorrow;
    if (datePreset === "近7天") return dateOnly >= today && dateOnly <= addDaysIso(today, 6);
    return appointmentDate >= rangeStart && appointmentDate <= rangeEnd;
  }

  const filteredAppointments = useMemo(() => {
    return [...appointments]
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
      .filter((item) => {
        const status = getAppointmentStatus(item.appointment_date);
        const keyword = search.trim().toLowerCase();
        const matchesSearch = !keyword || item.client_name.toLowerCase().includes(keyword) || (item.phone ?? "").toLowerCase().includes(keyword) || (item.address ?? "").toLowerCase().includes(keyword);
        const matchesStatus = statusFilter === "全部" || status === statusFilter;
        return matchesSearch && matchesStatus && matchesDatePreset(item.appointment_date);
      });
  }, [appointments, search, statusFilter, datePreset, rangeStart, rangeEnd]);

  const stats = {
    total: appointments.length,
    today: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "今日预约").length,
    upcoming: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "待上门").length,
    done: appointments.filter((item) => getAppointmentStatus(item.appointment_date) === "已完成").length,
  };

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
    setShowAppointmentModal(false);
  }

  async function copyAppointment(item: MeasurementAppointmentRecord) {
    const ok = await copyPlainText(formatAppointmentCopyText(item));
    setCopyState(ok ? `已复制 ${item.client_name} 的预约信息` : "复制失败");
  }

  async function copyAppointmentList() {
    const text = filteredAppointments.map((item) => formatAppointmentCopyText(item)).join("\n");
    const ok = await copyPlainText(text);
    setCopyState(ok ? `已复制 ${filteredAppointments.length} 条预约信息` : "复制失败");
  }

  function deleteAppointment(item: MeasurementAppointmentRecord) {
    setAppointments((prev) => prev.filter((entry) => entry.id !== item.id));
    setConfirmingAppointmentId(null);
  }

  const appointmentConfig: TabularSchemaConfig = {
    title: "测量预约",
    filePrefix: "biz-appointments",
    columns: ["客户", "电话", "地址", "预约时间", "状态", "说明"],
    exportRows: () => mapRows(filteredAppointments, (item) => [item.client_name, item.phone ?? "", item.address ?? "", item.appointment_date, getAppointmentStatus(item.appointment_date), item.description ?? ""]),
    printRows: () => mapRows(filteredAppointments, (item) => [item.client_name, item.phone ?? "-", item.address ?? "-", formatAppointmentDate(item.appointment_date), getAppointmentStatus(item.appointment_date), item.description ?? "-"]),
  };

  function exportAppointments() {
    exportTabularSchema(appointmentConfig);
  }

  function printAppointments() {
    printTabularSchema(appointmentConfig, `共 ${appointmentConfig.printRows().length} 条`);
  }

  return <div><SectionHeader eyebrow="Measurement Appointments" title="测量预约" actions={<><ActionBtn onClick={copyAppointmentList}>复制当前列表</ActionBtn><ActionBtn onClick={exportAppointments}>↓ 导出当前表</ActionBtn><ActionBtn onClick={printAppointments}>🖨 打印当前表</ActionBtn><ActionBtn tone="primary" onClick={() => setShowAppointmentModal(true)}>+ 新建预约</ActionBtn></>} /><StatStrip items={[{ label: "预约总数", value: String(stats.total) }, { label: "今日上门", value: String(stats.today), accent: "text-amber-600" }, { label: "待上门", value: String(stats.upcoming), accent: "text-sky-600" }, { label: "已完成", value: String(stats.done), accent: "text-emerald-600" }]} />{showAppointmentModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">新建测量预约</h3><p className="mt-1 text-sm text-slate-500">支持直接搜索客户并自动带出电话和地址。</p></div><button onClick={() => setShowAppointmentModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><select value={draft.client_id || ""} onChange={(e) => hydrateFromClient(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"><option value="">选择客户后自动带出电话和地址</option>{clientOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div><input list="appointment-client-options" value={draft.client_name} onChange={(e) => hydrateFromClientName(e.target.value)} placeholder="客户名称" className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-400 focus:outline-none" /><datalist id="appointment-client-options">{clients.map((item) => <option key={item.id} value={item.name} />)}</datalist></div><SmallInput value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} placeholder="电话" /><div className="sm:col-span-2 xl:col-span-2"><SmallInput value={draft.address} onChange={(v) => setDraft((d) => ({ ...d, address: v }))} placeholder="测量地址" /></div><SmallInput value={draft.appointment_date} onChange={(v) => setDraft((d) => ({ ...d, appointment_date: v }))} type="datetime-local" /><div className="sm:col-span-2 xl:col-span-3"><SmallInput value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="描述，例如栏杆、复尺、现场确认" /></div></div><p className="mt-2 text-[11px] text-slate-400">原始应用里预约实体还带 Google Calendar event id。当前网站架构没有外部日历凭证和同步流，所以先保留字段但只做站内排期。</p><div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => setShowAppointmentModal(false)}>取消</ActionBtn><ActionBtn tone="primary" onClick={addAppointment}>确认新建</ActionBtn></div></div></div> : null}<div className="mb-4"><PanelCard title="排期列表"><div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[180px] flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索客户 / 电话 / 地址" className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"><option>全部</option><option>今日预约</option><option>待上门</option><option>已完成</option></select><select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"><option>全部</option><option>今日</option><option>明日</option><option>近7天</option><option>自定义</option></select><input type="datetime-local" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" /><input type="datetime-local" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" /></div>{copyState ? <p className="mb-3 text-xs text-emerald-600">{copyState}</p> : null}<div className="space-y-2">{filteredAppointments.length ? filteredAppointments.map((item) => { const status = getAppointmentStatus(item.appointment_date); return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{item.client_name}</span><AppointmentStatusBadge status={status} /></div><p className="mt-1 text-xs text-slate-500">{formatAppointmentDate(item.appointment_date)}{item.phone ? ` · ${item.phone}` : ""}</p><p className="mt-1 text-xs text-slate-500">{item.address ?? "未填写地址"}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => copyAppointment(item)} className="rounded border border-sky-100 px-2 py-1 text-[11px] text-sky-600 hover:border-sky-300 hover:bg-sky-50 transition-colors">复制信息</button>{confirmingAppointmentId === item.id ? <><button onClick={() => deleteAppointment(item)} className="rounded border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingAppointmentId(null)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingAppointmentId(item.id)} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button>}</div></div>{item.description ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.description}</p> : null}</div>; }) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">当前没有预约记录</div>}</div></PanelCard></div></div>;
}

type StaffSub = "profiles" | "attendance" | "payroll" | "rules";
type AttendanceFilter = "today" | "thisWeek" | "lastWeek";
type PayrollWeekFilter = "lastWeek" | "thisWeek";

const WORKDAY_OPTIONS = [
  { key: "Mon", label: "周一" },
  { key: "Tue", label: "周二" },
  { key: "Wed", label: "周三" },
  { key: "Thu", label: "周四" },
  { key: "Fri", label: "周五" },
  { key: "Sat", label: "周六" },
  { key: "Sun", label: "周日" },
] as const;

const EMPLOYEE_GROUP_OPTIONS = ["华人", "墨西哥人"] as const;

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function startOfWeekIso(value: string) {
  const date = parseIsoDate(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function getRangeDates(start: string, end: string) {
  const result: string[] = [];
  const cursor = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  while (cursor <= endDate) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function getAttendanceRange(filter: AttendanceFilter) {
  const today = todayIso();
  const thisWeekStart = startOfWeekIso(today);
  if (filter === "today") return { start: today, end: today, label: "今天" };
  if (filter === "thisWeek") return { start: thisWeekStart, end: today, label: "本周" };
  return { start: addDaysIso(thisWeekStart, -7), end: addDaysIso(thisWeekStart, -1), label: "上周" };
}

function getPayrollWeekRange(filter: PayrollWeekFilter) {
  const today = todayIso();
  const thisWeekStart = startOfWeekIso(today);
  if (filter === "thisWeek") return { start: thisWeekStart, end: addDaysIso(thisWeekStart, 6), label: "本周" };
  return { start: addDaysIso(thisWeekStart, -7), end: addDaysIso(thisWeekStart, -1), label: "上周" };
}

function getWeekdayKey(value: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseIsoDate(value).getDay()] ?? "Mon";
}

function formatMinutes(value: number) {
  const safe = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}小时${String(minutes).padStart(2, "0")}分`;
}

function minutesToHours(value: number) {
  return Number((Math.max(0, value || 0) / 60).toFixed(2));
}

function calcWorkedMinutes(leaveMinutes: number, overtimeMinutes: number) {
  return Math.max(0, 600 + overtimeMinutes - leaveMinutes);
}

function nextEmployeeCode(employees: EmployeeRecord[]) {
  const max = employees.reduce((result, item) => {
    const parsed = Number(item.code || item.id.replace(/\D+/g, "") || 0);
    return Number.isFinite(parsed) && parsed > result ? parsed : result;
  }, 0);
  return String(max + 1).padStart(3, "0");
}

function ensureAttendanceRows(employees: EmployeeRecord[], attendances: AttendanceRecord[], range: { start: string; end: string }, settings: BizSettings) {
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  const existingMap = new Map(attendances.map((item) => [`${item.date}__${item.employee_id || item.employee_name}`, item]));
  const next = [...attendances];
  const defaultMinutes = Math.max(0, Math.round(settings.auto_attendance_default_minutes || 600));

  getRangeDates(range.start, range.end).forEach((date) => {
    employees.filter((item) => item.status === "在职").forEach((employee) => {
      const workdays = employee.workdays?.length ? employee.workdays : ["Mon", "Tue", "Wed", "Thu", "Fri"];
      if (!workdays.includes(getWeekdayKey(date))) return;
      const key = `${date}__${employee.id}`;
      if (existingMap.has(key)) return;
      const record: AttendanceRecord = {
        id: `ATT-${date.replaceAll("-", "")}-${employee.code || employee.id}`,
        date,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_code: employee.code,
        leave_minutes: 0,
        overtime_minutes: 0,
        worked_minutes: defaultMinutes,
        meal_allowance: defaultMinutes > 300 && Boolean(employee.meal_allowance_eligible),
        generated_by: `auto-rule:${settings.auto_attendance_timezone || "America/New_York"}:${settings.auto_attendance_run_time || "01:00"}`,
        note: settings.auto_attendance_note || undefined,
      };
      existingMap.set(key, record);
      next.push(record);
    });
  });

  return next.map((item) => {
    const employee = employeeMap.get(item.employee_id || "") || employees.find((row) => row.name === item.employee_name);
    const leaveMinutes = Math.max(0, Math.round(item.leave_minutes || 0));
    const overtimeMinutes = Math.max(0, Math.round(item.overtime_minutes || 0));
    const workedMinutes = calcWorkedMinutes(leaveMinutes, overtimeMinutes);
    return {
      ...item,
      employee_id: employee?.id || item.employee_id,
      employee_code: employee?.code || item.employee_code,
      employee_name: employee?.name || item.employee_name,
      leave_minutes: leaveMinutes,
      overtime_minutes: overtimeMinutes,
      worked_minutes: workedMinutes,
      meal_allowance: workedMinutes > 300 ? Boolean(item.meal_allowance && employee?.meal_allowance_eligible !== false) : false,
    };
  });
}

function EmployeesSection({ employees, setEmployees, attendances, setAttendances, payrolls, setPayrolls, expenses, setExpenses, settings, setSettings }: { employees: EmployeeRecord[]; setEmployees: React.Dispatch<React.SetStateAction<EmployeeRecord[]>>; attendances: AttendanceRecord[]; setAttendances: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>; payrolls: PayrollRecord[]; setPayrolls: React.Dispatch<React.SetStateAction<PayrollRecord[]>>; expenses: ExpenseRecord[]; setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>; settings: BizSettings; setSettings: React.Dispatch<React.SetStateAction<BizSettings>>; }) {
  const [sub, setSub] = useState<StaffSub>("profiles");
  const [profileEthnicityFilter, setProfileEthnicityFilter] = useState("全部");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("today");
  const [attendanceEthnicityFilter, setAttendanceEthnicityFilter] = useState("全部");
  const [payrollWeekFilter, setPayrollWeekFilter] = useState<PayrollWeekFilter>("lastWeek");
  const [payrollEthnicityFilter, setPayrollEthnicityFilter] = useState("全部");
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const today = todayIso();
  const attendanceRange = useMemo(() => getAttendanceRange(attendanceFilter), [attendanceFilter]);
  const payrollRange = useMemo(() => getPayrollWeekRange(payrollWeekFilter), [payrollWeekFilter]);
  const normalizedEmployees = useMemo(() => {
    let fallback = 1;
    return employees.map((item) => {
      const code = item.code || String(fallback++).padStart(3, "0");
      return {
        ...item,
        code,
        ethnicity: item.ethnicity || "华人",
        hourly_rate: item.hourly_rate ?? item.monthly_salary ?? 0,
        workdays: item.workdays?.length ? item.workdays : ["Mon", "Tue", "Wed", "Thu", "Fri"],
        meal_allowance_eligible: item.meal_allowance_eligible ?? true,
      };
    });
  }, [employees]);
  const seededAttendances = useMemo(() => ensureAttendanceRows(normalizedEmployees, attendances, attendanceRange, settings), [normalizedEmployees, attendances, attendanceRange, settings]);

  useEffect(() => {
    if (seededAttendances.length !== attendances.length) setAttendances(seededAttendances);
  }, [seededAttendances, attendances.length, setAttendances]);

  const profileRows = useMemo(() => normalizedEmployees
    .filter((item) => item.status === "在职")
    .filter((item) => profileEthnicityFilter === "全部" || item.ethnicity === profileEthnicityFilter)
    .sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id))), [normalizedEmployees, profileEthnicityFilter]);

  const attendanceRows = useMemo(() => seededAttendances
    .filter((item) => item.date >= attendanceRange.start && item.date <= attendanceRange.end)
    .filter((item) => {
      if (attendanceEthnicityFilter === "全部") return true;
      const employee = normalizedEmployees.find((row) => row.id === item.employee_id || row.name === item.employee_name);
      return employee?.ethnicity === attendanceEthnicityFilter;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.employee_code || a.employee_name).localeCompare(String(b.employee_code || b.employee_name))), [seededAttendances, attendanceRange, attendanceEthnicityFilter, normalizedEmployees]);

  const payrollRows = useMemo(() => normalizedEmployees
    .filter((employee) => employee.status === "在职")
    .filter((employee) => payrollEthnicityFilter === "全部" || employee.ethnicity === payrollEthnicityFilter)
    .map((employee) => {
      const rows = ensureAttendanceRows(normalizedEmployees, attendances, payrollRange, settings).filter((item) => (item.employee_id === employee.id || item.employee_name === employee.name) && item.date >= payrollRange.start && item.date <= payrollRange.end);
      const totalMinutes = rows.reduce((sum, item) => sum + item.worked_minutes, 0);
      const mealCount = rows.filter((item) => item.meal_allowance).length;
      const hourlyRate = employee.hourly_rate || 0;
      const wage = Number((minutesToHours(totalMinutes) * hourlyRate + mealCount * (settings.meal_allowance_amount || 0)).toFixed(2));
      const payrollId = `PAY-${payrollRange.start}-${employee.id}`;
      const existing = payrolls.find((item) => item.id === payrollId);
      return { employee, totalMinutes, mealCount, hourlyRate, wage, payrollId, paid: existing?.payment_status === "已发放" };
    }), [normalizedEmployees, attendances, payrollRange, settings, payrolls, payrollEthnicityFilter]);

  const [employeeDraft, setEmployeeDraft] = useState({ name: "", phone: "", hourly_rate: "", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"], meal_allowance_eligible: true, ethnicity: "华人", position: "" });
  const [attendanceDraft, setAttendanceDraft] = useState({ employee_id: "", date: today, leave_minutes: "0", overtime_minutes: "0" });

  function openCreateEmployee() {
    setEditingEmployeeId(null);
    setEmployeeDraft({ name: "", phone: "", hourly_rate: "", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"], meal_allowance_eligible: true, ethnicity: "华人", position: "" });
    setShowEmployeeModal(true);
  }

  function openEditEmployee(employee: EmployeeRecord) {
    setEditingEmployeeId(employee.id);
    setEmployeeDraft({
      name: employee.name,
      phone: employee.phone || "",
      hourly_rate: String(employee.hourly_rate ?? employee.monthly_salary ?? 0),
      workdays: employee.workdays?.length ? employee.workdays : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      meal_allowance_eligible: employee.meal_allowance_eligible ?? true,
      ethnicity: employee.ethnicity || "华人",
      position: employee.position || "",
    });
    setShowEmployeeModal(true);
  }

  function saveEmployee() {
    if (!employeeDraft.name.trim()) return;
    const code = editingEmployeeId ? normalizedEmployees.find((item) => item.id === editingEmployeeId)?.code || nextEmployeeCode(normalizedEmployees) : nextEmployeeCode(normalizedEmployees);
    const current = editingEmployeeId ? employees.find((item) => item.id === editingEmployeeId) : undefined;
    const payload: EmployeeRecord = {
      ...(current || {}),
      id: editingEmployeeId || `EMP-${code}`,
      code,
      name: employeeDraft.name.trim(),
      position: employeeDraft.position || undefined,
      phone: employeeDraft.phone || undefined,
      monthly_salary: Number(employeeDraft.hourly_rate) || 0,
      hourly_rate: Number(employeeDraft.hourly_rate) || 0,
      workdays: employeeDraft.workdays,
      meal_allowance_eligible: employeeDraft.meal_allowance_eligible,
      ethnicity: employeeDraft.ethnicity,
      status: "在职",
    };
    delete payload.hire_date;
    delete payload.contract_end;
    setEmployees((prev) => editingEmployeeId ? prev.map((item) => item.id === editingEmployeeId ? payload : item) : [payload, ...prev]);
    setShowEmployeeModal(false);
  }

  function setAttendanceField(id: string, field: "leave_minutes" | "overtime_minutes" | "meal_allowance", rawValue: number | boolean) {
    setAttendances((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const employee = normalizedEmployees.find((item) => item.id === row.employee_id || item.name === row.employee_name);
      const leaveMinutes = field === "leave_minutes" ? Number(rawValue) || 0 : row.leave_minutes;
      const overtimeMinutes = field === "overtime_minutes" ? Number(rawValue) || 0 : row.overtime_minutes;
      const workedMinutes = calcWorkedMinutes(leaveMinutes, overtimeMinutes);
      const manualMeal = field === "meal_allowance" ? Boolean(rawValue) : row.meal_allowance;
      return {
        ...row,
        leave_minutes: leaveMinutes,
        overtime_minutes: overtimeMinutes,
        worked_minutes: workedMinutes,
        meal_allowance: workedMinutes > 300 ? (employee?.meal_allowance_eligible ? manualMeal : false) : false,
      };
    }));
  }

  function saveAttendanceDraft() {
    const employee = normalizedEmployees.find((item) => item.id === attendanceDraft.employee_id) || normalizedEmployees[0];
    if (!employee) return;
    const leaveMinutes = Number(attendanceDraft.leave_minutes) || 0;
    const overtimeMinutes = Number(attendanceDraft.overtime_minutes) || 0;
    const workedMinutes = calcWorkedMinutes(leaveMinutes, overtimeMinutes);
    const nextRecord: AttendanceRecord = {
      id: `ATT-${attendanceDraft.date.replaceAll("-", "")}-${employee.code || employee.id}`,
      date: attendanceDraft.date,
      employee_id: employee.id,
      employee_name: employee.name,
      employee_code: employee.code,
      leave_minutes: leaveMinutes,
      overtime_minutes: overtimeMinutes,
      worked_minutes: workedMinutes,
      meal_allowance: workedMinutes > 300 && Boolean(employee.meal_allowance_eligible),
      generated_by: "manual",
      note: "手工补录",
    };
    setAttendances((prev) => {
      const key = `${nextRecord.date}__${nextRecord.employee_id}`;
      const filtered = prev.filter((item) => `${item.date}__${item.employee_id || item.employee_name}` !== key);
      return [nextRecord, ...filtered];
    });
    setAttendanceDraft({ employee_id: normalizedEmployees[0]?.id || "", date: attendanceRange.start, leave_minutes: "0", overtime_minutes: "0" });
    setShowAttendanceModal(false);
  }

  function markAllVisiblePaid() {
    const visible = payrollRows.filter((item) => !item.paid && item.wage > 0);
    if (!visible.length) return;
    const paidAt = todayIso();
    const expenseStart = expenses.length;
    setPayrolls((prev) => {
      const rest = prev.filter((item) => !visible.some((row) => row.payrollId === item.id));
      const next = visible.map((row, index) => ({
        id: row.payrollId,
        month: payrollRange.start.slice(0, 7),
        employee_id: row.employee.id,
        employee_name: row.employee.name,
        employee_code: row.employee.code,
        employee_ethnicity: row.employee.ethnicity,
        total_hours: minutesToHours(row.totalMinutes),
        hourly_rate: row.hourlyRate,
        meal_allowance_total: row.mealCount * (settings.meal_allowance_amount || 0),
        base_salary: row.wage,
        bonus: 0,
        deduction: 0,
        net_salary: row.wage,
        payment_status: "已发放",
        paid_at: paidAt,
        expense_id: `EXP-${new Date().getFullYear()}-${String(expenseStart + index + 1).padStart(3, "0")}`,
      } satisfies PayrollRecord));
      return [...next, ...rest];
    });
    setExpenses((prev) => [
      ...visible.map((row, index) => ({
        id: `EXP-${new Date().getFullYear()}-${String(expenseStart + index + 1).padStart(3, "0")}`,
        target: row.employee.name,
        detail: `${payrollRange.label}工资发放`,
        amount: row.wage,
        expense_type: "工资",
        payment_method: "转账",
        expense_date: paidAt,
        remark: `${payrollRange.start} ~ ${payrollRange.end}`,
      } satisfies ExpenseRecord)),
      ...prev,
    ]);
  }

  const ruleRows = [
    { label: "饭补金额", value: formatMoney(settings.meal_allowance_amount || 0) },
    { label: "自动考勤时区", value: settings.auto_attendance_timezone || "America/New_York" },
    { label: "自动执行时间", value: settings.auto_attendance_run_time || "01:00" },
    { label: "自动默认工时", value: formatMinutes(settings.auto_attendance_default_minutes || 600) },
    { label: "自动规则说明", value: `在职员工按工作日自动生成 10 小时考勤，再叠加请假 / 加班修正。` },
  ];

  const configs: Record<StaffSub, TabularSchemaConfig> = {
    profiles: {
      title: "员工档案",
      filePrefix: "biz-employees",
      columns: ["工号", "姓名", "电话", "职位", "时薪", "工作日", "饭补资格", "分组"],
      exportRows: () => profileRows.map((item) => [item.code || "", item.name, item.phone || "", item.position || "", item.hourly_rate || 0, (item.workdays || []).join("/"), item.meal_allowance_eligible ? "是" : "否", item.ethnicity]),
      printRows: () => profileRows.map((item) => [item.code || "-", item.name, item.phone || "-", item.position || "-", formatMoney(item.hourly_rate || 0), (item.workdays || []).map((day) => WORKDAY_OPTIONS.find((option) => option.key === day)?.label || day).join("、"), item.meal_allowance_eligible ? "可用" : "关闭", item.ethnicity]),
    },
    attendance: {
      title: "考勤记录",
      filePrefix: "biz-attendance",
      columns: ["日期", "工号", "姓名", "工作时长", "请假", "加班", "饭补"],
      exportRows: () => attendanceRows.map((item) => [item.date, item.employee_code || "", item.employee_name, minutesToHours(item.worked_minutes), minutesToHours(item.leave_minutes), minutesToHours(item.overtime_minutes), item.meal_allowance ? "是" : "否"]),
      printRows: () => attendanceRows.map((item) => [item.date, item.employee_code || "-", item.employee_name, formatMinutes(item.worked_minutes), formatMinutes(item.leave_minutes), formatMinutes(item.overtime_minutes), item.meal_allowance ? "是" : "否"]),
    },
    payroll: {
      title: "工资发放",
      filePrefix: "biz-payroll-weekly",
      columns: ["姓名", "时薪", "总工时", "工资", "是否已发放"],
      exportRows: () => payrollRows.map((item) => [item.employee.name, item.hourlyRate, minutesToHours(item.totalMinutes), item.wage, item.paid ? "是" : "否"]),
      printRows: () => payrollRows.map((item) => [item.employee.name, formatMoney(item.hourlyRate), formatMinutes(item.totalMinutes), formatMoney(item.wage), item.paid ? "已发放" : "未发放"]),
    },
    rules: {
      title: "员工系统规则",
      filePrefix: "biz-employee-rules",
      columns: ["规则项", "当前值"],
      exportRows: () => ruleRows.map((item) => [item.label, item.value]),
      printRows: () => ruleRows.map((item) => [item.label, item.value]),
    },
  };

  const printSubtitle = sub === "attendance"
    ? `${attendanceRange.label} ${attendanceRange.start} ~ ${attendanceRange.end}`
    : sub === "payroll"
      ? `${payrollRange.label} ${payrollRange.start} ~ ${payrollRange.end}`
      : "当前员工模块数据";

  return (
    <div>
      <SectionHeader
        eyebrow="Human Resources"
        title="员工管理"
        actions={
          <>
            <ActionBtn onClick={() => exportTabularSchema(configs[sub])}>↓ 导出当前表</ActionBtn>
            <ActionBtn onClick={() => printTabularSchema(configs[sub], printSubtitle)}>🖨 打印当前表</ActionBtn>
            {sub === "profiles" ? <ActionBtn tone="primary" onClick={openCreateEmployee}>+ 新建员工</ActionBtn> : null}
            {sub === "attendance" ? <ActionBtn tone="primary" onClick={() => { setAttendanceDraft({ employee_id: normalizedEmployees[0]?.id || "", date: attendanceRange.start, leave_minutes: "0", overtime_minutes: "0" }); setShowAttendanceModal(true); }}>+ 手工补录</ActionBtn> : null}
            {sub === "payroll" ? <ActionBtn tone="success" onClick={markAllVisiblePaid}>一键发放当前工资</ActionBtn> : null}
          </>
        }
      />
      <StatStrip items={[{ label: "在职员工", value: String(normalizedEmployees.filter((item) => item.status === "在职").length) }, { label: "当前考勤", value: String(attendanceRows.length), accent: "text-blue-600" }, { label: "当前工资", value: formatMoney(payrollRows.reduce((sum, item) => sum + item.wage, 0)), accent: "text-orange-600" }, { label: "已发放", value: formatMoney(payrollRows.filter((item) => item.paid).reduce((sum, item) => sum + item.wage, 0)), accent: "text-green-600" }]} />
      <SegmentedControl options={[{ key: "profiles", label: "员工档案" }, { key: "attendance", label: "考勤" }, { key: "payroll", label: "工资" }, { key: "rules", label: "员工系统规则" }]} value={sub} onChange={setSub} />

      {sub === "profiles" ? (
        <div className="space-y-4">
          <PanelCard title="员工档案" note="员工工号自动递增，员工档案单独管理，不再和考勤或规则混在一起。">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs text-slate-500">员工分组</span><select value={profileEthnicityFilter} onChange={(e) => setProfileEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><div className="text-xs text-slate-500">共 {profileRows.length} 名员工</div></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">工号</th><th className="px-4 py-2.5 font-semibold text-slate-600">姓名</th><th className="px-4 py-2.5 font-semibold text-slate-600">职位</th><th className="px-4 py-2.5 font-semibold text-slate-600">电话</th><th className="px-4 py-2.5 font-semibold text-slate-600">时薪</th><th className="px-4 py-2.5 font-semibold text-slate-600">工作日</th><th className="px-4 py-2.5 font-semibold text-slate-600">饭补资格</th><th className="px-4 py-2.5 font-semibold text-slate-600">分组</th><th className="px-4 py-2.5 font-semibold text-slate-600">操作</th></tr></thead><tbody>{profileRows.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.code}</td><td className="px-4 py-2.5 text-slate-700">{item.name}</td><td className="px-4 py-2.5 text-slate-600">{item.position || "-"}</td><td className="px-4 py-2.5 text-slate-600">{item.phone || "-"}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.hourly_rate || 0)}</td><td className="px-4 py-2.5 text-slate-600">{(item.workdays || []).map((day) => WORKDAY_OPTIONS.find((option) => option.key === day)?.label || day).join("、")}</td><td className="px-4 py-2.5 text-slate-600">{item.meal_allowance_eligible ? "可用" : "关闭"}</td><td className="px-4 py-2.5 text-slate-600">{item.ethnicity}</td><td className="px-4 py-2.5"><ActionBtn onClick={() => openEditEmployee(item)}>编辑</ActionBtn></td></tr>)}</tbody></table></div>
          </PanelCard>
        </div>
      ) : null}

      {sub === "attendance" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><SegmentedControl options={[{ key: "today", label: "今天" }, { key: "thisWeek", label: "本周" }, { key: "lastWeek", label: "上周" }]} value={attendanceFilter} onChange={setAttendanceFilter} /><div className="flex items-center gap-2"><span className="text-xs text-slate-500">分组</span><select value={attendanceEthnicityFilter} onChange={(e) => setAttendanceEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><span className="text-xs text-slate-500">{attendanceRange.start} ~ {attendanceRange.end}</span></div>
          <PanelCard title="考勤规则说明" note="当天工作时长 = 10小时 + 加班时长 - 请假时长。工时小于等于 5 小时时强制取消饭补。"><div className="text-xs text-slate-500">缺失考勤会按员工工作日和自动规则补齐，支持逐行人工修正。</div></PanelCard>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-3 py-2.5 font-semibold text-slate-600">日期</th><th className="px-3 py-2.5 font-semibold text-slate-600">工号</th><th className="px-3 py-2.5 font-semibold text-slate-600">人名</th><th className="px-3 py-2.5 font-semibold text-slate-600">工作时长</th><th className="px-3 py-2.5 font-semibold text-slate-600">请假时长</th><th className="px-3 py-2.5 font-semibold text-slate-600">加班时长</th><th className="px-3 py-2.5 font-semibold text-slate-600">饭补</th><th className="px-3 py-2.5 font-semibold text-slate-600">操作</th></tr></thead><tbody>{attendanceRows.map((item) => { const employee = normalizedEmployees.find((row) => row.id === item.employee_id || row.name === item.employee_name); const editing = editingAttendanceId === item.id; return <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-3 py-2.5 text-slate-600">{item.date}</td><td className="px-3 py-2.5 text-slate-700">{item.employee_code || employee?.code || "-"}</td><td className="px-3 py-2.5 font-medium text-slate-700">{item.employee_name}</td><td className="px-3 py-2.5 text-slate-700">{formatMinutes(item.worked_minutes)}</td>{editing ? <><td className="px-3 py-2.5"><SmallInput value={String(item.leave_minutes)} onChange={(v) => setAttendanceField(item.id, "leave_minutes", Number(v) || 0)} type="number" /></td><td className="px-3 py-2.5"><SmallInput value={String(item.overtime_minutes)} onChange={(v) => setAttendanceField(item.id, "overtime_minutes", Number(v) || 0)} type="number" /></td><td className="px-3 py-2.5"><label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={item.meal_allowance} disabled={item.worked_minutes <= 300 || !employee?.meal_allowance_eligible} onChange={(e) => setAttendanceField(item.id, "meal_allowance", e.target.checked)} /> 饭补</label></td><td className="px-3 py-2.5"><div className="flex gap-2"><ActionBtn tone="success" onClick={() => setEditingAttendanceId(null)}>完成</ActionBtn><ActionBtn onClick={() => setEditingAttendanceId(null)}>取消</ActionBtn></div></td></> : <><td className="px-3 py-2.5 text-slate-600">{formatMinutes(item.leave_minutes)}</td><td className="px-3 py-2.5 text-slate-600">{formatMinutes(item.overtime_minutes)}</td><td className="px-3 py-2.5 text-slate-600">{item.meal_allowance ? `是 · ${formatMoney(settings.meal_allowance_amount || 0)}` : "否"}</td><td className="px-3 py-2.5"><ActionBtn onClick={() => setEditingAttendanceId(item.id)}>编辑</ActionBtn></td></>}</tr>; })}</tbody></table></div>
        </div>
      ) : null}

      {sub === "payroll" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><SegmentedControl options={[{ key: "lastWeek", label: "上周" }, { key: "thisWeek", label: "本周" }]} value={payrollWeekFilter} onChange={setPayrollWeekFilter} /><div className="flex items-center gap-2"><span className="text-xs text-slate-500">分组</span><select value={payrollEthnicityFilter} onChange={(e) => setPayrollEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><span className="text-xs text-slate-500">{payrollRange.start} ~ {payrollRange.end}</span></div>
          <PanelCard title="工资说明" note={`工资 = 总工时 × 时薪 + 饭补次数 × ${formatMoney(settings.meal_allowance_amount || 0)}。点击一键发放后，会自动落一笔“工资”支出。`}><div className="text-xs text-slate-500">保留周维度发放，本周 / 上周两档。</div></PanelCard>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">姓名</th><th className="px-4 py-2.5 font-semibold text-slate-600">时薪</th><th className="px-4 py-2.5 font-semibold text-slate-600">总工时</th><th className="px-4 py-2.5 font-semibold text-slate-600">应发工资</th><th className="px-4 py-2.5 font-semibold text-slate-600">是否已发放工资</th></tr></thead><tbody>{payrollRows.map((item) => <tr key={item.employee.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2.5 font-medium text-slate-700">{item.employee.name}</td><td className="px-4 py-2.5 text-slate-700">{formatMoney(item.hourlyRate)}</td><td className="px-4 py-2.5 text-slate-600">{formatMinutes(item.totalMinutes)}</td><td className="px-4 py-2.5 font-semibold text-slate-800">{formatMoney(item.wage)}</td><td className="px-4 py-2.5 text-slate-600">{item.paid ? "已发放" : "未发放"}</td></tr>)}</tbody></table></div>
        </div>
      ) : null}

      {sub === "rules" ? (
        <div className="space-y-4">
          <PanelCard title="员工系统规则" note="员工系统规则独立成页，只保留规则配置，不再混入员工档案。">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div><p className="mb-1 text-[11px] font-semibold text-slate-500">饭补金额</p><SmallInput value={String(settings.meal_allowance_amount || 15)} onChange={(v) => setSettings((prev) => ({ ...prev, meal_allowance_amount: Number(v) || 0 }))} type="number" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-500">自动考勤时区</p><SmallInput value={settings.auto_attendance_timezone || "America/New_York"} onChange={(v) => setSettings((prev) => ({ ...prev, auto_attendance_timezone: v || "America/New_York" }))} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-500">执行时间</p><SmallInput value={settings.auto_attendance_run_time || "01:00"} onChange={(v) => setSettings((prev) => ({ ...prev, auto_attendance_run_time: v || "01:00" }))} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-500">自动默认工时</p><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{formatMinutes(settings.auto_attendance_default_minutes || 600)}</div></div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">自动考勤规则：{settings.auto_attendance_timezone || "America/New_York"} 每天 {settings.auto_attendance_run_time || "01:00"} 为在职员工按工作日自动生成 10 小时考勤，再叠加请假 / 加班修正。</div>
          </PanelCard>
        </div>
      ) : null}

      {showAttendanceModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">手工补录考勤</h3><p className="mt-1 text-sm text-slate-500">可直接指定员工和日期，覆盖当天已有记录。</p></div><button onClick={() => setShowAttendanceModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold text-slate-500">员工</p><SmallSelect value={attendanceDraft.employee_id} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, employee_id: v }))} options={normalizedEmployees.map((item) => item.id)} labels={Object.fromEntries(normalizedEmployees.map((item) => [item.id, `${item.code} · ${item.name}`]))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">日期</p><SmallInput value={attendanceDraft.date} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, date: v }))} type="date" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">请假时长（分钟）</p><SmallInput value={attendanceDraft.leave_minutes} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, leave_minutes: v }))} type="number" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">加班时长（分钟）</p><SmallInput value={attendanceDraft.overtime_minutes} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, overtime_minutes: v }))} type="number" /></div></div><div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">计算后工作时长：{formatMinutes(calcWorkedMinutes(Number(attendanceDraft.leave_minutes) || 0, Number(attendanceDraft.overtime_minutes) || 0))}</div><div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => setShowAttendanceModal(false)}>取消</ActionBtn><ActionBtn tone="primary" onClick={saveAttendanceDraft}>保存考勤</ActionBtn></div></div></div> : null}{showEmployeeModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">{editingEmployeeId ? "编辑员工" : "新建员工"}</h3><p className="mt-1 text-sm text-slate-500">工号自动递增，从 001 开始。</p></div><button onClick={() => setShowEmployeeModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><div><p className="mb-1 text-[11px] font-semibold text-slate-500">姓名</p><SmallInput value={employeeDraft.name} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, name: v }))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">职位</p><SmallInput value={employeeDraft.position} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, position: v }))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">电话</p><SmallInput value={employeeDraft.phone} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, phone: v }))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">时薪</p><SmallInput value={employeeDraft.hourly_rate} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, hourly_rate: v }))} type="number" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-500">分组</p><SmallSelect value={employeeDraft.ethnicity} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, ethnicity: v }))} options={[...EMPLOYEE_GROUP_OPTIONS]} /></div></div><div className="mt-4"><p className="mb-2 text-[11px] font-semibold text-slate-500">工作日</p><div className="flex flex-wrap gap-2">{WORKDAY_OPTIONS.map((option) => { const checked = employeeDraft.workdays.includes(option.key); return <label key={option.key} className={`rounded-lg border px-3 py-2 text-xs ${checked ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}><input type="checkbox" className="mr-2" checked={checked} onChange={(e) => setEmployeeDraft((draft) => ({ ...draft, workdays: e.target.checked ? [...draft.workdays, option.key] : draft.workdays.filter((day) => day !== option.key) }))} />{option.label}</label>; })}</div></div><label className="mt-4 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={employeeDraft.meal_allowance_eligible} onChange={(e) => setEmployeeDraft((draft) => ({ ...draft, meal_allowance_eligible: e.target.checked }))} /> 饭补资格</label><div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => setShowEmployeeModal(false)}>取消</ActionBtn><ActionBtn tone="primary" onClick={saveEmployee}>保存员工</ActionBtn></div></div></div> : null}
    </div>
  );
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
  const quoteConfigs: Record<QuoteSub, SplitTabularSchemaConfig> = {
    quotes: {
      title: "报价单列表",
      filePrefix: "biz-quotes",
      exportColumns: ["报价单号", "客户", "标题", "金额", "创建日期", "有效期至", "状态"],
      printColumns: ["报价单号", "客户", "标题 / 项目", "报价金额", "创建日期", "有效期至", "状态"],
      exportRows: () => mapRows(quotes, (item) => [item.id, item.client_name, item.title, item.amount, item.created_at, item.valid_until, item.status]),
      printRows: () => mapRows(quotes, (item) => [item.id, item.client_name, item.title, formatMoney(item.amount), item.created_at, item.valid_until, item.status]),
    },
    showcase: {
      title: "作品展示列表",
      filePrefix: "biz-showcase",
      exportColumns: ["作品名称", "类别", "图片数", "描述", "创建日期", "状态"],
      printColumns: ["作品名称", "类别", "图片数", "描述", "创建日期", "展示状态"],
      exportRows: () => mapRows(showcases, (item) => [item.name, item.category, item.image_count, item.description ?? "", item.created_at, item.status]),
      printRows: () => mapRows(showcases, (item) => [item.name, item.category, item.image_count, item.description ?? "-", item.created_at, item.status]),
    },
  };
  function exportQuotes() {
    exportTabularSchema(quoteConfigs[sub]);
  }
  function printQuote(quote: QuoteRecord) {
    openPrintWindow(buildQuotePrintHTML(quote, settings));
  }
  function printQuotes() {
    const config = quoteConfigs[sub];
    printTabularSchema(config, `共 ${config.printRows().length} 条`);
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

  const expenseTypeValue = settings.expense_types || "采购\n工资\n物流\n办公\n其他";
  const supplierCategoryValue = settings.supplier_categories || "布料\n五金\n玻璃\n物流\n其他";
  const settingRows: Array<{ label: string; value: string | number }> = [
    { label: "\u516c\u53f8\u540d\u79f0", value: settings.company_name || "-" },
    { label: "\u516c\u53f8\u4e2d\u6587\u540d\u79f0", value: settings.company_name_zh || "-" },
    { label: "\u5730\u5740", value: settings.address || "-" },
    { label: "\u6253\u5370\u5730\u5740", value: settings.company_address || settings.address || "-" },
    { label: "\u7535\u8bdd", value: settings.phone || "-" },
    { label: "\u6253\u5370\u7535\u8bdd", value: settings.phones || settings.phone || "-" },
    { label: "\u7535\u5b50\u90ae\u7bb1", value: settings.email || "-" },
    { label: "\u7f51\u7ad9", value: settings.website || "-" },
    { label: "\u7a0e\u53f7(BN)", value: settings.tax_number || "-" },
    { label: "\u9ed8\u8ba4\u7a0e\u7387", value: String(settings.default_tax_rate ?? "-") },
    { label: "\u9ed8\u8ba4\u8d27\u5e01", value: settings.default_currency || "-" },
    { label: "\u8d22\u5e74\u5f00\u59cb\u6708", value: String(settings.fiscal_start_month ?? "-") },
    { label: "\u94f6\u884c\u8d26\u6237", value: settings.bank_account || "-" },
    { label: "\u652f\u4ed8\u5b9d", value: settings.alipay || "-" },
    { label: "\u5fae\u4fe1\u6536\u6b3e", value: settings.wechat_pay || "-" },
    { label: "\u5176\u4ed6\u65b9\u5f0f", value: settings.other_payment || "-" },
    { label: "\u53d1\u7968\u6807\u9898", value: settings.invoice_title || "Invoice" },
    { label: "\u9886\u6599\u5355\u6807\u9898", value: settings.picking_title || "\u9886\u6599\u5355 / Worker Pickup Sheet" },
    { label: "Zelle", value: settings.zelle || "-" },
    { label: "\u53d1\u7968\u5907\u6ce8\u6a21\u677f", value: settings.invoice_note || "-" },
    { label: "\u62a5\u4ef7\u9ed8\u8ba4\u6709\u6548\u671f", value: String(settings.quote_valid_days ?? "-") },
    { label: "\u62a5\u4ef7\u9875\u811a\u5907\u6ce8", value: settings.quote_footer || "-" },
    { label: "Logo URL", value: settings.logo_url || "-" },
    { label: "支出类型", value: expenseTypeValue || "-" },
    { label: "供应商分类", value: supplierCategoryValue || "-" },
  ];

  const settingsConfig: TabularSchemaConfig = {
    title: "\u7cfb\u7edf\u8bbe\u7f6e",
    filePrefix: "biz-settings",
    columns: ["\u5b57\u6bb5", "\u503c"],
    exportRows: () => mapRows(settingRows, (item) => [item.label, item.value]),
    printRows: () => mapRows(settingRows, (item) => [item.label, item.value]),
  };

  function exportSettings() {
    exportTabularSchema(settingsConfig);
  }

  function printSettings() {
    printTabularSchema(settingsConfig, "\u5f53\u524d\u4e1a\u52a1\u914d\u7f6e");
  }

  return <div><SectionHeader eyebrow="Configuration" title="公司信息" actions={<><ActionBtn onClick={exportSettings}>↓ 导出设置</ActionBtn><ActionBtn onClick={printSettings}>🖨 打印设置</ActionBtn><ActionBtn tone="success">自动保存中</ActionBtn></>} /><div className="grid gap-4 lg:grid-cols-2"><SettingsGroup title="公司信息"><SettingsField label="公司名称" value={settings.company_name} onChange={(value) => update("company_name", value)} /><SettingsField label="公司中文名称" value={settings.company_name_zh ?? ""} onChange={(value) => update("company_name_zh", value)} /><SettingsField label="地址" value={settings.address} onChange={(value) => update("address", value)} /><SettingsField label="打印地址" value={settings.company_address ?? ""} note="留空时回退到公司地址" onChange={(value) => update("company_address", value)} /><SettingsField label="电话" value={settings.phone} onChange={(value) => update("phone", value)} /><SettingsField label="打印电话" value={settings.phones ?? ""} note="支持多行，打印时会自动拼接" onChange={(value) => update("phones", value)} /><SettingsField label="电子邮箱" value={settings.email} onChange={(value) => update("email", value)} /><SettingsField label="网站" value={settings.website} onChange={(value) => update("website", value)} /></SettingsGroup><SettingsGroup title="税务 & 财务"><SettingsField label="税号 (BN)" value={settings.tax_number} note="Business Number" onChange={(value) => update("tax_number", value)} /><SettingsField label="默认税率" value={String(settings.default_tax_rate)} onChange={(value) => update("default_tax_rate", value)} type="number" /><SettingsField label="默认货币" value={settings.default_currency} onChange={(value) => update("default_currency", value)} /><SettingsField label="财年开始月" value={String(settings.fiscal_start_month)} onChange={(value) => update("fiscal_start_month", value)} type="number" /></SettingsGroup><SettingsGroup title="收款信息"><SettingsField label="银行账户" value={settings.bank_account} onChange={(value) => update("bank_account", value)} /><SettingsField label="支付宝" value={settings.alipay} onChange={(value) => update("alipay", value)} /><SettingsField label="微信收款" value={settings.wechat_pay} onChange={(value) => update("wechat_pay", value)} /><SettingsField label="其他方式" value={settings.other_payment} onChange={(value) => update("other_payment", value)} /><SettingsField label="Zelle" value={settings.zelle ?? ""} onChange={(value) => update("zelle", value)} /></SettingsGroup><SettingsGroup title="打印模板"><SettingsField label="发票标题" value={settings.invoice_title ?? ""} onChange={(value) => update("invoice_title", value)} /><SettingsField label="领料单标题" value={settings.picking_title ?? ""} onChange={(value) => update("picking_title", value)} /><SettingsField label="发票备注模板" value={settings.invoice_note ?? ""} note="订单没填备注时自动使用这里" onChange={(value) => update("invoice_note", value)} /></SettingsGroup><SettingsGroup title="报价单模板"><SettingsField label="默认有效期" value={String(settings.quote_valid_days)} note="Days until quote expires" onChange={(value) => update("quote_valid_days", value)} type="number" /><SettingsField label="页脚备注" value={settings.quote_footer} onChange={(value) => update("quote_footer", value)} /><SettingsField label="Logo URL" value={settings.logo_url} note="Used in printed quotes" onChange={(value) => update("logo_url", value)} /></SettingsGroup><SettingsGroup title="支出类型"><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-600">支出类型列表</label><textarea value={expenseTypeValue} onChange={(e) => update("expense_types", e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none resize-none" /><p className="text-[11px] text-slate-400">一行一个，或者用逗号分隔。收支管理会直接读取这里。</p></div></SettingsGroup><SettingsGroup title="供应商分类"><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-600">供应商分类列表</label><textarea value={supplierCategoryValue} onChange={(e) => update("supplier_categories", e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none resize-none" /><p className="text-[11px] text-slate-400">一行一个，或者用逗号分隔。供应商新增/编辑会直接读取这里。</p></div></SettingsGroup></div></div>;
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
  const [attendances, setAttendances] = useState<AttendanceRecord[]>(bizAttendances);
  const [appointments, setAppointments] = useState<MeasurementAppointmentRecord[]>(bizAppointments);
  const [appointmentPrefill, setAppointmentPrefill] = useState<Partial<MeasurementAppointmentRecord> | null>(null);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>(bizPayrolls);
  const [quotes, setQuotes] = useState<QuoteRecord[]>(bizQuotes);
  const [showcases, setShowcases] = useState<ShowcaseRecord[]>(bizShowcases);
  const [printArchives, setPrintArchives] = useState<PrintArchiveRecord[]>(bizPrintArchives);
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
        setAttendances(payload.data.attendances ?? []);
        setAppointments(payload.data.appointments ?? []);
        setPayrolls(payload.data.payrolls ?? []);
        setQuotes(payload.data.quotes ?? []);
        setShowcases(payload.data.showcases ?? []);
        setPrintArchives(payload.data.printArchives ?? []);
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
            attendances,
            appointments,
            payrolls,
            quotes,
            showcases,
            printArchives,
            settings,
          } satisfies BizStoreSnapshot),
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isHydrated, orders, clients, suppliers, expenses, cashEntries, materials, purchases, employees, attendances, appointments, payrolls, quotes, showcases, printArchives, settings]);

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
          {section === "orders" && <OrdersSection orders={orders} materials={materials} clients={clients} setOrders={setOrders} settings={settings} printArchives={printArchives} setPrintArchives={setPrintArchives} setCashEntries={setCashEntries} setExpenses={setExpenses} />}
          {section === "finance" && (
            <FinanceSection
              orders={orders}
              setOrders={setOrders}
              expenses={expenses}
              setExpenses={setExpenses}
              cashEntries={cashEntries}
              setCashEntries={setCashEntries}
              payrolls={payrolls}
              clients={clients}
              setClients={setClients}
              suppliers={suppliers}
              employees={employees}
              settings={settings}
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
              setOrders={setOrders}
              appointments={appointments}
              setAppointments={setAppointments}
              setCashEntries={setCashEntries}
              purchases={purchases}
              setPurchases={setPurchases}
              settings={settings}
              onCreateAppointment={(client) => {
                setAppointmentPrefill({ client_id: client.id, client_name: client.name, phone: client.phone, address: client.address, appointment_date: `${todayIso()}T10:00`, description: "" });
                setSection("appointments");
              }}
            />
          )}
          {section === "appointments" && (
            <AppointmentsSection
              appointments={appointments}
              setAppointments={setAppointments}
              clients={clients}
              prefillClient={appointmentPrefill}
              onPrefillConsumed={() => setAppointmentPrefill(null)}
            />
          )}
          {section === "materials" && (
            <MaterialsSection
              materials={materials}
              setMaterials={setMaterials}
              purchases={purchases}
              setPurchases={setPurchases}
              suppliers={suppliers}
              orders={orders}
            />
          )}
          {section === "employees" && (
            <EmployeesSection
              employees={employees}
              setEmployees={setEmployees}
              attendances={attendances}
              setAttendances={setAttendances}
              payrolls={payrolls}
              setPayrolls={setPayrolls}
              expenses={expenses}
              setExpenses={setExpenses}
              settings={settings}
              setSettings={setSettings}
            />
          )}
          {section === "settings" && <SettingsSection settings={settings} setSettings={setSettings} />}
        </div>
      </div>
    </PageSection>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  bizPayrolls,
  bizSettings,
  bizSuppliers,
  bizPrintArchives,
  bizAppointments,
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
  type VipPriceRecord,
  type PaymentRecord,
  type PayrollRecord,
  type PrintArchiveRecord,
  type SupplierRecord,
} from "@/lib/biz-data";
import type { BizStoreSnapshot } from "@/lib/biz-store";

const PIC_BASE = 'http://43.166.250.145/pic/';
function imgUrl(src: string | undefined | null): string {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
  return PIC_BASE + src;
}

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return formatLocalDate(new Date());
}

function monthIso() {
  return todayIso().slice(0, 7);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasExactOrderNumber(value: string | undefined, orderNumber: string) {
  if (!value?.trim()) return false;
  const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(orderNumber)}([^A-Za-z0-9-]|$)`, "i");
  return pattern.test(value);
}

function expenseReferencesOrder(item: ExpenseRecord, orderNumber: string) {
  return item.order_id === orderNumber || [item.target, item.detail, item.remark ?? ""].some((value) => textHasExactOrderNumber(value, orderNumber));
}

function cashEntryReferencesOrder(item: CashEntry, orderNumber: string) {
  return item.order_number === orderNumber || item.order_id === orderNumber || textHasExactOrderNumber(item.note, orderNumber);
}

function formatCashLinkAmount(amount: number) {
  return Number(amount || 0).toFixed(2);
}

function buildOrderCashMatchKey(orderNumber: string, type: "payment" | "refund", date: string, amount: number) {
  return `${orderNumber}|${type}|${date}|${formatCashLinkAmount(amount)}`;
}

function reconcileCashEntries(
  cashEntries: CashEntry[],
  orders: BizOrder[],
  expenses: ExpenseRecord[],
) {
  const officeExpenseIds = new Set(
    expenses.filter((item) => item.office).map((item) => item.id),
  );
  const orderPaymentCounts = new Map<string, number>();

  for (const order of orders) {
    for (const record of order.payment_history ?? []) {
      if (!record.office) continue;
      const key = buildOrderCashMatchKey(
        order.order_number,
        record.type === "refund" ? "refund" : "payment",
        record.date,
        record.amount,
      );
      orderPaymentCounts.set(key, (orderPaymentCounts.get(key) ?? 0) + 1);
    }
  }

  return cashEntries.flatMap((entry) => {
    if (entry.source_type === "office-transfer") {
      return [{ ...entry, office: true }];
    }

    if (entry.source_type === "expense") {
      const isOffice = Boolean(entry.source_id && officeExpenseIds.has(entry.source_id));
      return isOffice ? [{ ...entry, office: true }] : [];
    }

    if (entry.source_type === "order-payment" || entry.source_type === "order-refund" || entry.source_type === "order-deposit") {
      const orderNumber = entry.order_number?.trim();
      if (!orderNumber) return [];
      const expectedType = entry.source_type === "order-refund" ? "refund" : "payment";
      const key = buildOrderCashMatchKey(orderNumber, expectedType, entry.date, entry.amount);
      const remaining = orderPaymentCounts.get(key) ?? 0;
      if (remaining <= 0) return [];
      orderPaymentCounts.set(key, remaining - 1);
      return [{ ...entry, office: true }];
    }

    return [{ ...entry, office: Boolean(entry.office) }];
  });
}

function sameCashEntryList(left: CashEntry[], right: CashEntry[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return !!other
      && item.id === other.id
      && item.type === other.type
      && item.amount === other.amount
      && item.date === other.date
      && item.note === other.note
      && item.method === other.method
      && item.office === other.office
      && item.order_number === other.order_number
      && item.source_type === other.source_type
      && item.source_id === other.source_id
      && item.order_id === other.order_id
      && item.voided === other.voided;
  });
}

function normalizeEntityText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeEntityPhone(value?: string | null) {
  return value?.replace(/\D+/g, "") ?? "";
}

function findClientByReference(
  clients: ContactRecord[],
  input: { clientId?: string; clientName?: string; phone?: string },
) {
  if (input.clientId) {
    const byId = clients.find((item) => item.id === input.clientId);
    if (byId) return byId;
  }

  const normalizedName = normalizeEntityText(input.clientName);
  const normalizedPhone = normalizeEntityPhone(input.phone);
  const nameMatches = normalizedName
    ? clients.filter((item) => normalizeEntityText(item.name) === normalizedName)
    : [];

  if (normalizedPhone && nameMatches.length > 1) {
    const exactMatches = nameMatches.filter((item) => normalizeEntityPhone(item.phone) === normalizedPhone);
    if (exactMatches.length === 1) return exactMatches[0];
  }

  if (nameMatches.length === 1) {
    const matched = nameMatches[0];
    const matchedPhone = normalizeEntityPhone(matched.phone);
    if (!normalizedPhone || !matchedPhone || matchedPhone === normalizedPhone) return matched;
  }

  if (normalizedPhone) {
    const phoneMatches = clients.filter((item) => normalizeEntityPhone(item.phone) === normalizedPhone);
    if (phoneMatches.length === 1) return phoneMatches[0];
  }

  return undefined;
}

function findSupplierByReference(
  suppliers: SupplierRecord[],
  input: { supplierId?: string; supplierName?: string },
) {
  if (input.supplierId) {
    const byId = suppliers.find((item) => item.id === input.supplierId);
    if (byId) return byId;
  }

  const normalizedName = normalizeEntityText(input.supplierName);
  if (!normalizedName) return undefined;

  const matches = suppliers.filter((item) => normalizeEntityText(item.name) === normalizedName);
  return matches.length === 1 ? matches[0] : undefined;
}

type DirectoryRole = "客户" | "供应商";

function directoryKey(value: { master_id?: string; name?: string; phone?: string }) {
  const masterId = normalizeEntityText(value.master_id);
  if (masterId) return `master:${masterId}`;
  const name = normalizeEntityText(value.name);
  const phone = normalizeEntityPhone(value.phone);
  if (name && phone) return `match:${name}|${phone}`;
  return "";
}

function mergeDirectoryRoles(...roles: Array<DirectoryRole | undefined>) {
  return Array.from(new Set(roles.filter(Boolean) as DirectoryRole[]));
}

function linkDirectoryEntities(clients: ContactRecord[], suppliers: SupplierRecord[]) {
  type Group = { masterId: string; clients: ContactRecord[]; suppliers: SupplierRecord[] };
  const groups = new Map<string, Group>();

  function collect(kind: "clients" | "suppliers", record: ContactRecord | SupplierRecord) {
    const key = directoryKey(record) || `${kind}:${record.id}`;
    const masterId = normalizeEntityText((record as any).master_id) || record.id;
    const group = groups.get(key) ?? { masterId, clients: [], suppliers: [] };
    if (!normalizeEntityText(group.masterId)) group.masterId = masterId;
    group[kind].push(record as never);
    groups.set(key, group);
  }

  clients.forEach((item) => collect("clients", item));
  suppliers.forEach((item) => collect("suppliers", item));

  return {
    clients: clients.map((item) => {
      const group = groups.get(directoryKey(item) || `clients:${item.id}`);
      return {
        ...item,
        master_id: group?.masterId ?? item.master_id ?? item.id,
        roles: mergeDirectoryRoles(item.roles?.[0], item.roles?.[1], "客户", group && group.suppliers.length ? "供应商" : undefined),
      };
    }),
    suppliers: suppliers.map((item) => {
      const group = groups.get(directoryKey(item) || `suppliers:${item.id}`);
      return {
        ...item,
        master_id: group?.masterId ?? item.master_id ?? item.id,
        roles: mergeDirectoryRoles(item.roles?.[0], item.roles?.[1], "供应商", group && group.clients.length ? "客户" : undefined),
      };
    }),
  };
}

function directoryBadgeLabel(record: { master_id?: string; roles?: Array<DirectoryRole>; name?: string; phone?: string }, counterpartList: Array<{ master_id?: string; name?: string; phone?: string }>, ownRole: DirectoryRole) {
  const existing = record.roles?.filter(Boolean) ?? [];
  if (existing.length) return Array.from(new Set(existing)).join(" / ");
  const key = directoryKey(record);
  if (!key) return ownRole;
  const hasPartner = counterpartList.some((item) => directoryKey(item) === key);
  return hasPartner ? "客户 / 供应商" : ownRole;
}

function orderBelongsToClient(order: BizOrder, client: ContactRecord) {
  if (order.client_id && order.client_id === client.id) return true;
  const sameName = normalizeEntityText(order.client_name) === normalizeEntityText(client.name);
  const orderPhone = normalizeEntityPhone(order.phone);
  const clientPhone = normalizeEntityPhone(client.phone);
  if (sameName && (!orderPhone || !clientPhone || orderPhone === clientPhone)) return true;
  return Boolean(orderPhone && clientPhone && orderPhone === clientPhone);
}

function appointmentBelongsToClient(appt: MeasurementAppointmentRecord, client: ContactRecord) {
  if (appt.client_id && appt.client_id === client.id) return true;
  const sameName = normalizeEntityText(appt.client_name) === normalizeEntityText(client.name);
  const apptPhone = normalizeEntityPhone(appt.phone);
  const clientPhone = normalizeEntityPhone(client.phone);
  if (sameName && (!apptPhone || !clientPhone || apptPhone === clientPhone)) return true;
  return Boolean(apptPhone && clientPhone && apptPhone === clientPhone);
}


function materialBelongsToSupplier(item: MaterialRecord, supplier: SupplierRecord) {
  return item.supplier_id === supplier.id || normalizeEntityText(item.supplier) === normalizeEntityText(supplier.name);
}

function nextSequentialId(values: string[], prefix: string, width = 3) {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  const max = values.reduce((current, value) => {
    const match = pattern.exec(value);
    const next = match ? Number(match[1]) : 0;
    return Math.max(current, Number.isFinite(next) ? next : 0);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

function nextYearScopedId(values: string[], prefix: string, year: number, width = 3, offset = 1) {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-${year}-(\\d+)$`);
  const max = values.reduce((current, value) => {
    const match = pattern.exec(value);
    const next = match ? Number(match[1]) : 0;
    return Math.max(current, Number.isFinite(next) ? next : 0);
  }, 0);
  return `${prefix}-${year}-${String(max + offset).padStart(width, "0")}`;
}

function addDaysIso(base: string, days: number) {
  const value = new Date(`${base}T00:00:00`);
  value.setDate(value.getDate() + days);
  return formatLocalDate(value);
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

function buildBizSnapshot(input: Partial<BizStoreSnapshot>): BizStoreSnapshot {
  return {
    revision: input.revision ?? "",
    orders: (input.orders ?? []).map(normalizeOrderOfficeMethods),
    clients: input.clients ?? [],
    suppliers: input.suppliers ?? [],
    expenses: (input.expenses ?? []).map(normalizeExpenseOfficeMethod),
    cashEntries: (input.cashEntries ?? []).map(normalizeCashEntryMethod),
    materials: input.materials ?? [],
    employees: input.employees ?? [],
    attendances: input.attendances ?? [],
    appointments: input.appointments ?? [],
    payrolls: input.payrolls ?? [],
    quotes: input.quotes ?? [],
    showcases: input.showcases ?? [],
    printArchives: input.printArchives ?? [],
    settings: input.settings ?? bizSettings,
  };
}

function serializeBizSnapshot(snapshot: BizStoreSnapshot) {
  return JSON.stringify(snapshot);
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


function getSupplierCategoryOptions(settings: BizSettings) {
  return (settings.supplier_categories || "布料\n五金\n玻璃\n物流\n其他")
    .split(/[\n,,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function calcUsdCost(factoryPriceRmb: number, weight?: number) {
  return Number((((weight && weight > 0 ? weight : 1) + factoryPriceRmb) / 7).toFixed(2));
}

// ─── primitives ──────────────────────────────────────────────────────────────

function PageSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[30px] border border-gray-200 bg-[linear-gradient(180deg,_#1e3a5f,_#172554)] p-3 shadow-2xl">
      <div className="rounded-[24px] border border-gray-200 bg-gray-50 p-3">
        {children}
      </div>
    </div>
  );
}

function DisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 opacity-60 cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function ActionBtn({
  children,
  onClick,
  tone = "default",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger" | "success";
  disabled?: boolean;
}) {
  const tones = {
    default: "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
    primary: "border-slate-900 bg-slate-900 text-white hover:bg-slate-700 hover:border-slate-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  } as const;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : tones[tone]}`}
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
    <div className="flex flex-wrap divide-x divide-blue-800 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-[80px] flex-col px-3 py-2">
          <span className={`text-base font-bold ${item.accent ?? "text-slate-800"}`}>
            {item.value}
          </span>
          <span className="mt-0.5 text-[10px] text-slate-700">{item.label}</span>
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
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-4 py-2 font-semibold text-slate-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={cols.length || 1} className="py-10 text-center text-xs text-slate-700">
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
      color: "border-gray-200 bg-white hover:border-gray-200 shadow-sm",
      dot: "bg-gray-500",
      stats: [
        { label: "全部订单", value: String(orderSummary.total) },
        { label: "未付清", value: formatMoney(orderSummary.balance), accent: "text-red-600" },
      ],
    },
    {
      key: "finance",
      title: "收支管理",
      sub: "Finance",
      color: "border-gray-200 bg-white hover:border-gray-200 shadow-sm",
      dot: "bg-green-500",
      stats: [
        { label: "收入", value: formatMoney(orderSummary.amountPaid), accent: "text-green-600" },
        { label: "净利润", value: formatMoney(orderSummary.amountPaid - totalExpense - totalPayroll), accent: "text-emerald-600" },
      ],
    },
    {
      key: "clients",
      title: "客户档案",
      sub: "Contacts",
      color: "border-gray-200 bg-white hover:border-gray-200 shadow-sm",
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
      color: "border-gray-200 bg-white hover:border-gray-200 shadow-sm",
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
      color: "border-gray-200 bg-white hover:border-gray-200 shadow-sm",
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
  clients,
  suppliers,
  materials,
  employees,
}: {
  onNavigate: (key: string) => void;
  orderSummary: ReturnType<typeof summarizeOrders>;
  expenses: ExpenseRecord[];
  payrolls: PayrollRecord[];
  clients: ContactRecord[];
  suppliers: SupplierRecord[];
  materials: MaterialRecord[];
  employees: EmployeeRecord[];
}) {
  const domains = getOverviewDomains(orderSummary, { expenses: expenses.filter((e) => !e.voided), payrolls, clients, suppliers, materials, employees });
  return (
    <div>
      <SectionHeader eyebrow="Business Overview" title="业务总览" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => (
          <button
            key={d.key}
            onClick={() => onNavigate(d.key)}
            className={`group rounded-xl border p-3 text-left transition-all hover:shadow-md ${d.color}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${d.dot}`} />
                <span className="text-sm font-semibold text-slate-700">{d.title}</span>
              </div>
              <span className="text-xs text-slate-7000 transition-colors group-hover:text-slate-800">
                {d.sub} →
              </span>
            </div>
            <div className="flex gap-6">
              {d.stats.map((s) => (
                <div key={s.label}>
                  <p className={`text-xl font-bold ${s.accent ?? "text-slate-800"}`}>{s.value}</p>
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Quick-links strip */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 px-4 py-2">
          <p className="text-xs font-semibold text-slate-700">快捷入口</p>
        </div>
        <div className="flex flex-wrap divide-x divide-blue-800">
          {[
            { label: "新建定制单", section: "orders" },
            { label: "新建批发单", section: "orders" },
            { label: "录入支出", section: "finance" },
            { label: "添加客户", section: "clients" },
            { label: "采购入库", section: "materials" },
          ].map((q) => (
            <button
              key={q.label}
              onClick={() => onNavigate(q.section)}
              className="px-5 py-3 text-xs font-medium text-slate-700 hover:bg-gray-100 hover:text-slate-800 transition-colors"
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

/** Derive status from financial state - mirrors legacy syncOrderBalance logic */
function deriveStatus(totalAfterTax: number, amountPaid: number, currentStatus: string): string {
  if (totalAfterTax > 0 && amountPaid >= totalAfterTax) return "结清";
  if (amountPaid > 0) return "未付清";
  if (currentStatus === "已关闭") return "已关闭";
  if (currentStatus === "已作废") return "已作废";
  return "下单";
}

const OFFICE_PAYMENT_METHOD = "现金";
const PAYMENT_METHODS = [OFFICE_PAYMENT_METHOD, "支票", "刷卡", "转账"];

function normalizeOrderOfficeMethods(order: BizOrder): BizOrder {
  return {
    ...order,
    payment_history: (order.payment_history ?? []).map((record) => ({
      ...record,
      method: record.office ? OFFICE_PAYMENT_METHOD : (record.method || OFFICE_PAYMENT_METHOD),
    })),
  };
}

function normalizeExpenseOfficeMethod(expense: ExpenseRecord): ExpenseRecord {
  return {
    ...expense,
    payment_method: expense.office ? OFFICE_PAYMENT_METHOD : (expense.payment_method || OFFICE_PAYMENT_METHOD),
  };
}

function normalizeCashEntryMethod(entry: CashEntry): CashEntry {
  return {
    ...entry,
    method: OFFICE_PAYMENT_METHOD,
    office: entry.source_type === "office-transfer" ? true : Boolean(entry.office),
  };
}

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
      <label className="mb-1 block text-[11px] font-semibold text-slate-700">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
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
      <label className="mb-1 block text-[11px] font-semibold text-slate-700">{label}</label>
      <div className="flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "下单": "bg-gray-50 text-slate-800",
    "未付清": "bg-amber-100 text-amber-700",
    "结清": "bg-green-100 text-green-700",
    "已关闭": "bg-slate-100 text-slate-500",
    "已作废": "bg-red-50 text-red-400",
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 py-6 text-center text-xs text-slate-700">
        暂无收款记录
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
            <th className="px-3 py-2 font-semibold text-slate-600">金额</th>
            <th className="px-3 py-2 font-semibold text-slate-600">方式</th>
            <th className="px-3 py-2 font-semibold text-slate-600">类型</th>
            <th className="px-3 py-2 font-semibold text-slate-600">备注</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-b border-gray-200 last:border-b-0">
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
              <td className="px-3 py-2 text-slate-700">{r.note ?? "-"}</td>
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 py-6 text-center text-xs text-slate-700">
        暂无物料记录
      </div>
    );
  }
  const subtotal = rows.reduce((sum, r) => sum + r.qty * r.unit_price, 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
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
            <tr key={i} className="border-b border-gray-200 last:border-b-0">
              <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
              <td className="px-3 py-2 text-slate-600">{r.spec ?? "-"}</td>
              <td className="px-3 py-2 text-slate-700">{r.qty}</td>
              <td className="px-3 py-2 text-slate-600">{r.unit}</td>
              <td className="px-3 py-2 text-slate-700">{formatMoney(r.unit_price)}</td>
              <td className="px-3 py-2 font-medium text-slate-700">{formatMoney(r.qty * r.unit_price)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
              物料小计 / Subtotal
            </td>
            <td className="px-3 py-2 font-bold text-slate-700">{formatMoney(subtotal)}</td>
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
  async function handleRowImage(i: number, file?: File | null) {
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
      updateRow(i, 'image', res.filename || '');
    }
  const subtotal = rows.reduce((sum, r) => sum + r.qty * r.unit_price, 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
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
              <tr key={i} className="border-b border-gray-200">
                <td className="px-2 py-1.5">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                    className="h-7 w-full min-w-[100px] rounded border border-slate-300 px-2 text-xs focus:border-gray-200 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.spec ?? ""}
                    onChange={(e) => updateRow(i, "spec", e.target.value)}
                    className="h-7 w-full min-w-[80px] rounded border border-slate-300 px-2 text-xs focus:border-gray-200 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={r.qty}
                    onChange={(e) => updateRow(i, "qty", Number(e.target.value) || 0)}
                    className="h-7 w-16 rounded border border-slate-300 px-2 text-xs focus:border-gray-200 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(i, "unit", e.target.value)}
                    className="h-7 w-14 rounded border border-slate-300 px-2 text-xs focus:border-gray-200 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={r.unit_price}
                    onChange={(e) => updateRow(i, "unit_price", Number(e.target.value) || 0)}
                    className="h-7 w-20 rounded border border-slate-300 px-2 text-xs focus:border-gray-200 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                  {formatMoney(r.qty * r.unit_price)}
                </td>
                <td className="px-2 py-1.5">
                  <label className="relative block h-8 w-10 cursor-pointer overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {r.image ? (
                      <img src={imgUrl(r.image)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-700">+图</span>
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
                <td className="px-2 py-2 font-bold text-slate-700">{formatMoney(subtotal)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-700 hover:border-gray-200 hover:text-slate-700 transition-colors"
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
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-700">
        还没有保存的打印单
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => (
        <div key={record.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{record.title}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {formatPrintTypeLabel(record.print_type)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-700">{record.created_at.slice(0, 16).replace("T", " ")}{record.summary ? ` · ${record.summary}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onReprint(record)} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-gray-50 transition-colors">再次打印</button>
              <button onClick={() => downloadHtmlFile(record.file_name, record.html)} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 transition-colors">下载 HTML</button>
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
  const hasPhoto = Boolean(draft.preview_image);
  const photo = hasPhoto
    ? `<img src="${escHtml(imgUrl(draft.preview_image))}" alt="preview" style="width:100%;height:100%;object-fit:cover;display:block"/>`
    : `<div style="width:100%;height:100%;background:#fff"></div>`;
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
      <div class="photoInner${hasPhoto ? "" : " photoInnerBlank"}">${photo}</div>
      ${hasPhoto ? `<div class="photoCode">${escHtml(order.order_number)}</div>` : ""}
    </div>
    <div class="descWrap"><div style="padding:10px;font-size:13px;line-height:1.65;color:#111827;min-height:260px;white-space:pre-wrap">${escHtml(draft.description || "-")}</div></div>
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
        <h1 style="font-size:13px"><span style="white-space:nowrap">${escHtml(template.phoneDisplay ? `OFFICE: ${template.phoneDisplay}` : "OFFICE")}</span></h1>
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
`, { pageTitle: `Invoice ${order.order_number}`, bodyPadding: "0", maxWidth: "202mm", extraStyles: `@page{size:A4 portrait;margin:4mm}.sheet{width:202mm;height:289mm;overflow:hidden;border:1px solid #a3a3a3;background:#fff}.topbar{display:grid;grid-template-columns:1.4fr 0.8fr;gap:4px;padding:4px;background:${brandBlue}}.topbox{background:${brandBlue};color:#fff;padding:10px 12px;min-height:52px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.35)}.topbox h1{font-size:14px;font-weight:800;letter-spacing:.02em;color:#fff}.topbox p{font-size:10px;line-height:1.2;color:rgba(255,255,255,.92)}.sectionBlue{background:${brandBlue};color:#fff;font-weight:700;padding:7px 10px;font-size:13px}.contactInvoice{display:grid;grid-template-columns:2.4fr 1fr;gap:4px;padding:0 4px 4px;background:${brandBlue}}.panel{border:1px solid #a3a3a3;background:#fff}.rows{padding:0;background:#fff}.row{display:grid;grid-template-columns:58px 1fr 58px 1fr;border-top:1px solid #d4d4d4}.row:first-child{border-top:none}.cell{padding:8px 10px;font-size:11px}.label{font-weight:700}.invoiceBox .big{font-size:16px;font-weight:800;text-align:center;padding:14px 10px;border-top:1px solid #d4d4d4}.invoiceBox .date{font-size:14px;font-weight:800;text-align:center;padding:14px 10px;border-top:1px solid #d4d4d4}.midBlue{margin:0 4px 4px;background:${brandBlue};color:#fff;padding:7px 10px;font-size:11px;font-weight:700;display:flex;justify-content:space-between}.middle{display:grid;grid-template-columns:1.08fr 0.92fr;gap:4px;padding:0 4px 4px}.photoWrap{border:1px solid #a3a3a3;background:#fff;height:148mm;position:relative;padding:4px}.photoInner{height:100%;border:1px solid #111827;background:#e5e7eb;overflow:hidden}.photoInnerBlank{border:none;background:#fff}.photoCode{position:absolute;left:12px;bottom:8px;font-size:24px;font-weight:900;letter-spacing:.04em;color:#111}.descWrap{border:1px solid #a3a3a3;background:#fff;height:148mm;overflow:hidden}.descWrap > div{padding:10px!important;font-size:12px!important;line-height:1.45!important;min-height:auto!important}.bottom{display:grid;grid-template-columns:1.2fr .9fr;gap:4px;padding:0 4px 4px}.noteBody{border:1px solid #a3a3a3;background:#fff;padding:10px;min-height:72mm;font-size:11px;line-height:1.45;overflow:hidden}.totalBody{border:1px solid #a3a3a3;background:#fff;padding:10px 12px;min-height:72mm;display:flex;flex-direction:column;justify-content:center;gap:10px}.totalRow{display:flex;justify-content:space-between;font-size:15px;font-weight:800}.totalRow .v{color:#2b6fdb}@media print{html,body{margin:0!important;padding:0!important}.sheet{border:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid;page-break-inside:avoid}}` });
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
  const pickupTitle = settings?.picking_title || "领料单 / Worker Pickup Sheet";
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
                  ? `<img src="${escHtml(imgUrl(r.image))}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;display:block;margin:0 auto">`
                  : '<span style="color:#cbd5e1;font-size:22px">□</span>'}
              </td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="4" style="padding:24px;text-align:center;color:#94a3b8;border:1px solid #bfdbfe">暂无物料 / No materials</td></tr>`;

  return buildPrintShell(pickupTitle, `
<div style="border-bottom:3px solid #1e40af;padding-bottom:14px;margin-bottom:18px">
  <h1 style="font-size:22px;font-weight:800;color:#1e40af">${escHtml(pickupTitle)}</h1>
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
</table>`, { pageTitle: `${pickupTitle} · ${order.order_number}` });
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
    /<script>window\.onload\s*=\s*function\s*\(\s*\)\s*\{\s*window\.print\s*\(\s*\)\s*;?\s*\}\s*<\/script>/gi,
    ""
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

/** Full order detail panel - replaces the list view when an order is selected */
function OrderDetailView({
  order,
  settings,
  materials,
  onBack,
  onSave,
  onOfficeEntry,
  onSaveVipPrice,
}: {
  order: BizOrder;
  settings: BizSettings;
  materials: MaterialRecord[];
  onBack: () => void;
  onSave: (updated: BizOrder) => void;
  onOfficeEntry: (entry: CashEntry) => void;
  onSaveVipPrice: (clientName: string, materialName: string, price: number) => void;
}) {
  const today = formatLocalDate(new Date());
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
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("");
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState("");
  const [noMaterial, setNoMaterial] = useState(!order.material_rows?.length);
  const [vipEditMat, setVipEditMat] = useState<string | null>(null);
  const [vipEditVal, setVipEditVal] = useState("");

  const isVip = false; // VIP status would need clients list — not available here; falls back to per-client VIP prices only

  const materialCategoryOptions = [...new Set(materials.map((m) => m.category).filter(Boolean))].sort() as string[];
  const materialSupplierOptions = [...new Set(materials.map((m) => m.supplier).filter(Boolean))].sort() as string[];

  const filteredMaterials = materials.filter((m) => {
    if (materialSearch && !m.name.toLowerCase().includes(materialSearch.toLowerCase()) && !(m.code && m.code.toLowerCase().includes(materialSearch.toLowerCase()))) return false;
    if (materialCategoryFilter && m.category !== materialCategoryFilter) return false;
    if (materialSupplierFilter && m.supplier !== materialSupplierFilter) return false;
    return true;
  });

  const materialTotal = materialRows.reduce((sum, r) => sum + r.qty * r.unit_price * (r.is_return ? -1 : 1), 0);

  function getVipPrice(clientName: string, materialName: string): number | null {
    try {
      const allPrices: VipPriceRecord[] = settings.vip_prices ? JSON.parse(settings.vip_prices) : [];
      const match = allPrices.find((p) => p.client_name === clientName && p.material_name === materialName);
      return match ? match.price : null;
    } catch { return null; }
  }

  function addMaterialToOrder(mat: MaterialRecord) {
    const clientVipPrice = getVipPrice(draft.client_name.trim(), mat.name);
    const price = clientVipPrice ?? (mat.sale_price_usd ?? 0);
    setMaterialRows((prev) => [...prev, { name: mat.name, spec: mat.specification || undefined, qty: 1, unit: mat.unit, unit_price: price, image: mat.image || undefined }]);
  }

  function updateSelectedMaterial(i: number, key: keyof MaterialRow, val: string | number | boolean) {
    setMaterialRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }

  function removeSelectedMaterial(i: number) {
    setMaterialRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const [paymentMode, setPaymentMode] = useState<"payment" | "refund">("payment");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    date: today,
    amount: "",
    method: OFFICE_PAYMENT_METHOD,
    note: "",
    office: false,
  });

  useEffect(() => {
    if (!newPayment.office || newPayment.method === OFFICE_PAYMENT_METHOD) return;
    setNewPayment((p) => ({ ...p, method: OFFICE_PAYMENT_METHOD }));
  }, [newPayment.office, newPayment.method]);

  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleImageUpload(file?: File | null) {
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
      update("preview_image", res.filename || '');
    }

  function buildUpdated(): BizOrder {
    // For wholesale: use material total if materials selected, else draft.total_price (no-material mode)
    const wholesalePrice = !isCustom && !noMaterial ? materialTotal : draft.total_price;
    const effectivePrice = !isCustom ? wholesalePrice : draft.total_price;
    const totalAfterTax = calcTotalAfterTax(effectivePrice, draft.tax_rate, draft.discount);
    return {
      ...order,
      client_name: draft.client_name,
      phone: draft.phone || undefined,
      address: draft.address || undefined,
      preview_image: isCustom ? draft.preview_image || undefined : undefined,
      total_price: effectivePrice,
      tax_rate: draft.tax_rate || undefined,
      discount: draft.discount || undefined,
      total_after_tax: totalAfterTax,
      description: isCustom ? draft.description || undefined : undefined,
      install_info: isCustom ? draft.install_info || undefined : undefined,
      remarks: isCustom ? draft.remarks || undefined : undefined,
      material_rows: isCustom ? undefined : (noMaterial ? undefined : materialRows),
    };
  }

  function handleSave() {
    onSave(buildUpdated());
  }

  function buildPrintHtml(printType: "invoice" | "pickup") {
    const updatedOrder = buildUpdated();
    return printType === "pickup"
      ? buildWorkerPickupHTML(updatedOrder, materialRows, settings)
      : buildCustomerInvoiceHTML(updatedOrder, draft, materialRows, settings);
  }

  function handleDirectPrint(printType: "invoice" | "pickup") {
    const html = buildPrintHtml(printType);
    onSave(buildUpdated());
    openPrintWindow(html);
  }

  function handleAddPayment() {
    const amount = Number(newPayment.amount) || 0;
    if (amount <= 0) return;
    const prevAmountPaid = (order.payment_history ?? []).filter((r) => r.type === "payment").reduce((s, r) => s + r.amount, 0) - (order.payment_history ?? []).filter((r) => r.type === "refund").reduce((s, r) => s + r.amount, 0);
    const totalAfterTax = calcTotalAfterTax(draft.total_price, draft.tax_rate, draft.discount);
    const nextAmountPaid = prevAmountPaid + (paymentMode === "payment" ? amount : -amount);
    const nextBalance = Math.max(0, totalAfterTax - nextAmountPaid);
    const record: PaymentRecord = {
      date: newPayment.date,
      amount,
      method: newPayment.office ? OFFICE_PAYMENT_METHOD : newPayment.method,
      note: newPayment.note || (paymentMode === "payment" ? (nextBalance === 0 ? `${order.order_type}全款付清` : `${order.order_type}收款`) : `${order.order_type}退款`) || undefined,
      type: paymentMode,
      office: newPayment.office,
    };
    const history = [...(order.payment_history ?? []), record];
    const balance = nextBalance;
    const amountPaid = nextAmountPaid;
    const status = deriveStatus(totalAfterTax, amountPaid, order.status ?? "下单");
    onSave({
      ...buildUpdated(),
      payment_history: history,
      amount_paid: amountPaid,
      balance,
      status,
    });
    if (paymentMode === "payment" && newPayment.office) {
      onOfficeEntry({
        id: `CASH-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        type: "收入",
        amount,
        date: newPayment.date,
        note: `${order.order_number} 办公室收款`,
        office: true,
        order_number: order.order_number,
        order_id: order.order_number,
        source_type: "order-payment",
        source_id: `${order.order_number}:${newPayment.date}:${amount}:payment`,
      });
    }
    if (paymentMode === "refund" && newPayment.office) {
      onOfficeEntry({
        id: `CASH-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        type: "支出",
        amount,
        date: newPayment.date,
        note: `${order.order_number} 办公室退款`,
        office: true,
        order_number: order.order_number,
        order_id: order.order_number,
        source_type: "order-refund",
        source_id: `${order.order_number}:${newPayment.date}:${amount}:refund`,
      });
    }
    setNewPayment({ date: today, amount: "", method: OFFICE_PAYMENT_METHOD, note: "", office: false });
    setShowAddPayment(false);
  }

  return (
    <div>
      {/* Detail header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-700 transition-colors"
        >
          ← 返回列表
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-700">{order.order_number}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              isCustom ? "bg-gray-50 text-slate-800" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {order.order_type}
          </span>
          <StatusBadge status={order.status ?? "下单"} />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => handleDirectPrint("invoice")}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-gray-50"
          >
            打印发票单
          </button>
          {!isCustom && (
            <button
              onClick={() => handleDirectPrint("pickup")}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              打印领料单
            </button>
          )}
          {order.status !== "已关闭" && (
            <button
              onClick={() => onSave({ ...buildUpdated(), status: "已关闭" })}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:text-red-600 transition-colors"
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
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
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

        {/* Description or Material section - depends on order type */}
        {isCustom ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
              工程说明
            </h3>
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <EditField label="说明" value={draft.description} onChange={(v) => update("description", v)} multiline />
                <EditField label="安装说明" value={draft.install_info} onChange={(v) => update("install_info", v)} multiline />
                <EditField label="备注" value={draft.remarks} onChange={(v) => update("remarks", v)} multiline />
              </div>
              <div className="shrink-0">
                <p className="mb-1 text-[11px] font-semibold text-slate-700">款式图片</p>
                <label className="group relative block h-[160px] w-[120px] cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {draft.preview_image ? (
                    <img src={imgUrl(draft.preview_image)} alt="款式图片" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-slate-700 text-center px-2">暂无图片</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="text-[11px] font-semibold text-slate-700 text-center px-2 leading-snug">{draft.preview_image ? "点击替换" : "点击上传"}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e.target.files?.[0])} />
                </label>
                {draft.preview_image && (
                  <button type="button" onClick={() => update("preview_image", "")} className="mt-1.5 w-full rounded border border-slate-200 py-1 text-[11px] text-slate-700 hover:border-red-300 hover:text-red-500 transition-colors">移除</button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
              物料选择
            </h3>
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={noMaterial} onChange={(e) => { setNoMaterial(e.target.checked); if (e.target.checked) setMaterialRows([]); }} className="h-3.5 w-3.5" />
                不选物料，直接填总价
              </label>

              {noMaterial ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">总价</label>
                  <input type="number" min={0} step={0.01} placeholder="0.00" value={draft.total_price || ""} onChange={(e) => setDraft((d) => ({ ...d, total_price: Number(e.target.value) || 0 }))} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none" />
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                      <span className="text-[11px] font-semibold text-slate-700">选择物料</span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <select value={materialCategoryFilter} onChange={(e) => setMaterialCategoryFilter(e.target.value)} className="h-7 rounded border border-slate-300 px-1.5 text-[10px] text-slate-700 focus:border-gray-200 focus:outline-none">
                          <option value="">全部分类</option>
                          {materialCategoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select value={materialSupplierFilter} onChange={(e) => setMaterialSupplierFilter(e.target.value)} className="h-7 rounded border border-slate-300 px-1.5 text-[10px] text-slate-700 focus:border-gray-200 focus:outline-none">
                          <option value="">全部供应商</option>
                          {materialSupplierOptions.map((sup) => <option key={sup} value={sup}>{sup}</option>)}
                        </select>
                        <input type="text" placeholder="搜索..." value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} className="h-7 w-28 rounded border border-slate-300 px-2 text-[11px] text-slate-700 focus:border-gray-200 focus:outline-none" />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {filteredMaterials.length === 0 ? (
                        <p className="py-4 text-center text-[11px] text-slate-500">没有匹配的物料</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {filteredMaterials.map((mat) => {
                            const clientVipPrice = getVipPrice(draft.client_name.trim(), mat.name);
                            const displayPrice = clientVipPrice ?? (mat.sale_price_usd ?? 0);
                            const isClientVipPrice = clientVipPrice != null;
                            const alreadyAdded = materialRows.some((r) => r.name === mat.name);
                            const isEditingThis = vipEditMat === mat.name;
                            if (isEditingThis) {
                              return (
                                <div key={mat.id} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
                                    {mat.image ? <img src={imgUrl(mat.image)} alt={mat.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">无图</div>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-medium text-slate-800">{mat.name}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-[10px] text-amber-600">VIP$</span>
                                      <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={vipEditVal}
                                        onChange={(e) => setVipEditVal(e.target.value)}
                                        onBlur={() => { const p = Number(vipEditVal); if (!isNaN(p) && p >= 0) onSaveVipPrice(draft.client_name.trim(), mat.name, p); setVipEditMat(null); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") { const p = Number(vipEditVal); if (!isNaN(p) && p >= 0) onSaveVipPrice(draft.client_name.trim(), mat.name, p); setVipEditMat(null); } else if (e.key === "Escape") setVipEditMat(null); }}
                                        className="h-5 w-16 rounded border border-amber-300 px-1 text-[10px] text-amber-700 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <button key={mat.id} type="button" disabled={alreadyAdded} onClick={() => addMaterialToOrder(mat)} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white">
                                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
                                  {mat.image ? <img src={imgUrl(mat.image)} alt={mat.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">无图</div>}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium text-slate-800">{mat.name} <span className="font-normal text-slate-500">{mat.code}</span></p>
                                  <p className="text-[10px] text-slate-500">
                                    {isClientVipPrice ? "VIP专属价" : "卖出价"}: <span className={`font-semibold ${isClientVipPrice ? "text-amber-600" : "text-slate-700"}`}>${displayPrice}</span>
                                    <span className="ml-2">库存: {mat.stock_quantity}</span>
                                    {isClientVipPrice && <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVipEditMat(mat.name); setVipEditVal(String(displayPrice)); }} className="ml-1 cursor-pointer text-[9px] text-amber-500 hover:text-amber-700" title="编辑VIP价格">✎</span>}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {materialRows.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">已选物料</p>
                      <div className="space-y-1.5">
                        {materialRows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-800">{r.name}</p><p className="text-[10px] text-slate-500">{r.spec || ""}</p></div>
                            <input type="number" min={1} value={r.qty} onChange={(e) => updateSelectedMaterial(i, "qty", Math.max(1, Number(e.target.value) || 1))} className="h-7 w-14 rounded border border-slate-300 px-1.5 text-center text-xs text-slate-700 focus:border-gray-200 focus:outline-none" />
                            <span className="w-14 text-right text-xs text-slate-700">${(r.qty * r.unit_price).toFixed(2)}</span>
                            <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-600">
                              <input type="checkbox" checked={!!r.is_return} onChange={(e) => updateSelectedMaterial(i, "is_return", e.target.checked)} className="h-3 w-3" />退货
                            </label>
                            <button type="button" onClick={() => removeSelectedMaterial(i)} className="rounded p-0.5 text-xs text-slate-400 hover:text-red-500 transition-colors">✕</button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-700">总价</span>
                        <span className="text-sm font-bold text-slate-700">{formatMoney(materialTotal)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}


        {/* Bottom: 金额结算 + 收款记录 */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* 金额结算 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-3 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
              金额结算
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  总价 {!isCustom && <span className="font-normal text-slate-700">(物料自动同步)</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.total_price}
                  onChange={(e) => update("total_price", Number(e.target.value) || 0)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">税率 %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={draft.tax_rate}
                    onChange={(e) => update("tax_rate", Number(e.target.value) || 0)}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">折扣 $</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={draft.discount}
                    onChange={(e) => update("discount", Number(e.target.value) || 0)}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                  />
                </div>
              </div>
              {(draft.tax_rate > 0 || draft.discount > 0) && (
                <ReadonlyDisplay label="税后合计">
                  <span className="font-semibold text-slate-700">
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
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">状态</label>
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
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">收款记录</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPaymentMode("payment");
                    setShowAddPayment(true);
                  }}
                  className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-slate-800 hover:bg-gray-50 transition-colors"
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
              <div className={`mb-3 rounded-lg p-3 ${paymentMode === "payment" ? "border border-gray-100 bg-gray-50/50" : "border border-rose-100 bg-rose-50/50"}`}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">日期</label>
                    <input
                      type="date"
                      value={newPayment.date}
                      onChange={(e) => setNewPayment((p) => ({ ...p, date: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">金额</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment((p) => ({ ...p, amount: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">方式</label>
                    <select
                      value={newPayment.method}
                      disabled={newPayment.office}
                      onChange={(e) => setNewPayment((p) => ({ ...p, method: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">备注</label>
                    <input
                      type="text"
                      placeholder="可选备注"
                      value={newPayment.note}
                      onChange={(e) => setNewPayment((p) => ({ ...p, note: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                    />
                  </div>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={newPayment.office} onChange={(e) => setNewPayment((p) => ({ ...p, office: e.target.checked, method: e.target.checked ? OFFICE_PAYMENT_METHOD : p.method }))} /> 这笔资金进入/流出办公室</label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleAddPayment}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${paymentMode === "payment" ? "bg-gray-100 text-slate-700 hover:bg-gray-100" : "bg-rose-600 text-white hover:bg-rose-700"}`}
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
  clients,
  materials,
  onClose,
  onCreate,
  initialClientName,
  initialPhone,
  editOrder,
  settings,
  onSaveVipPrice,
}: {
  type: "定制单" | "批发单";
  existingOrders: BizOrder[];
  clients: ContactRecord[];
  settings: BizSettings;
  materials: MaterialRecord[];
  onClose: () => void;
  onCreate: (order: BizOrder) => void;
  initialClientName?: string;
  initialPhone?: string;
  editOrder?: BizOrder;
  onSaveVipPrice: (clientName: string, materialName: string, price: number) => void;
}) {
  const today = formatLocalDate(new Date());
  const [fields, setFields] = useState({
    client_name: editOrder?.client_name ?? initialClientName ?? "",
    phone: editOrder?.phone ?? initialPhone ?? "",
    address: editOrder?.address ?? "",
    description: editOrder?.description ?? "",
    total_price: editOrder ? String(editOrder.total_after_tax ?? editOrder.total_price ?? "") : "",
    deposit: "",
    deposit_method: OFFICE_PAYMENT_METHOD,
    deposit_note: "",
    deposit_office: false,
    preview_image: editOrder?.preview_image ?? "",
  });
  const [selectedMaterials, setSelectedMaterials] = useState<MaterialRow[]>(editOrder?.material_rows ?? []);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("");
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState("");
  const [noMaterial, setNoMaterial] = useState(!editOrder?.material_rows?.length);
  const [vipEditMat, setVipEditMat] = useState<string | null>(null);
  const [vipEditVal, setVipEditVal] = useState("");

  const isVip = clients.some((c) => c.name === fields.client_name.trim() && c.is_vip);
  const materialTotal = selectedMaterials.reduce((sum, r) => sum + r.qty * r.unit_price * (r.is_return ? -1 : 1), 0);

  const materialCategoryOptions = (() => {
    const cats = [...new Set(materials.map((m) => m.category).filter(Boolean))] as string[];
    return cats.sort();
  })();
  const materialSupplierOptions = (() => {
    const sups = [...new Set(materials.map((m) => m.supplier).filter(Boolean))] as string[];
    return sups.sort();
  })();

  function getVipPrice(clientName: string, materialName: string): number | null {
    try {
      const allPrices: VipPriceRecord[] = settings.vip_prices ? JSON.parse(settings.vip_prices) : [];
      const match = allPrices.find((p) => p.client_name === clientName && p.material_name === materialName);
      return match ? match.price : null;
    } catch { return null; }
  }

  function addMaterialToOrder(mat: MaterialRecord) {
    // Per-client VIP price first, then blanket VIP price, then default sale price
    const clientVipPrice = getVipPrice(fields.client_name.trim(), mat.name);
    const price = clientVipPrice ?? (isVip && mat.vip_sale_price_usd != null ? mat.vip_sale_price_usd : (mat.sale_price_usd ?? 0));
    setSelectedMaterials((prev) => [...prev, {
      name: mat.name,
      spec: mat.specification || undefined,
      qty: 1,
      unit: mat.unit,
      unit_price: price,
      image: mat.image || undefined,
    }]);
  }

  function updateSelectedMaterial(i: number, key: keyof MaterialRow, val: string | number | boolean) {
    setSelectedMaterials((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }

  function removeSelectedMaterial(i: number) {
    setSelectedMaterials((prev) => prev.filter((_, idx) => idx !== i));
  }

  const filteredMaterials = materials.filter((m) => {
    if (materialSearch && !m.name.toLowerCase().includes(materialSearch.toLowerCase()) && !(m.code && m.code.toLowerCase().includes(materialSearch.toLowerCase()))) return false;
    if (materialCategoryFilter && m.category !== materialCategoryFilter) return false;
    if (materialSupplierFilter && m.supplier !== materialSupplierFilter) return false;
    return true;
  });

  function set(key: string, val: string | boolean) {
    setFields((f) => ({ ...f, [key]: val }));
  }

  useEffect(() => {
    if (!fields.deposit_office || fields.deposit_method === OFFICE_PAYMENT_METHOD) return;
    setFields((f) => ({ ...f, deposit_method: OFFICE_PAYMENT_METHOD }));
  }, [fields.deposit_office, fields.deposit_method]);

  function hydrateClient(name: string, phone?: string) {
    const matched = findClientByReference(clients, { clientName: name.trim(), phone });
    if (!matched) return;
    setFields((f) => ({
      ...f,
      client_name: matched.name,
      phone: matched.phone ?? phone ?? f.phone,
      address: matched.address ?? f.address,
    }));
  }

  useEffect(() => {
    if (editOrder || !fields.client_name.trim()) return;
    const matched = findClientByReference(clients, { clientName: fields.client_name.trim(), phone: fields.phone });
    if (!matched) return;
    setFields((f) => ({
      ...f,
      client_name: matched.name,
      phone: matched.phone ?? f.phone,
      address: matched.address ?? f.address,
    }));
  }, [editOrder, clients, fields.client_name, fields.phone]);

  async function handlePreviewUpload(file?: File | null) {
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
      setFields((f) => ({ ...f, preview_image: res.filename || "" }));
    }

  function handleCreate() {
    if (!fields.client_name.trim()) return;

    const wholesaleTotal = type === "批发单" ? (noMaterial ? (Number(fields.total_price) || 0) : materialTotal) : 0;

    if (editOrder) {
      const totalPrice = type === "批发单" ? wholesaleTotal : (Number(fields.total_price) || 0);
      const paymentHistory = editOrder.payment_history ?? [];
      const amountPaid = Math.max(0, paymentHistory.reduce((sum, record) => sum + (record.type === "refund" ? -record.amount : record.amount), 0));
      const balance = Math.max(0, totalPrice - amountPaid);
      const matchedClient = findClientByReference(clients, { clientName: fields.client_name.trim(), phone: fields.phone });
      const updatedOrder: BizOrder = {
        ...editOrder,
        client_name: fields.client_name.trim(),
        client_id: matchedClient?.id ?? editOrder.client_id,
        phone: fields.phone || undefined,
        address: fields.address || undefined,
        description: editOrder.order_type === "定制单" ? (fields.description || undefined) : undefined,
        preview_image: editOrder.order_type === "定制单" ? fields.preview_image || undefined : undefined,
        total_price: totalPrice,
        total_after_tax: totalPrice,
        amount_paid: Number(amountPaid.toFixed(2)),
        balance: Number(balance.toFixed(2)),
        status: deriveStatus(totalPrice, amountPaid, editOrder.status ?? "下单"),
        material_rows: editOrder.order_type === "批发单" && !noMaterial ? selectedMaterials : undefined,
      };
      onCreate(updatedOrder);
      onClose();
      return;
    }

    const prefix = type === "定制单" ? "C" : "W";
    const year = new Date().getFullYear();
    const orderNumber = nextYearScopedId(existingOrders.map((item) => item.order_number), prefix, year, 4);

    const totalPrice = type === "批发单" ? wholesaleTotal : (Number(fields.total_price) || 0);
    const deposit = Number(fields.deposit) || 0;
    const balance = Math.max(0, totalPrice - deposit);
    const status = deriveStatus(totalPrice, deposit, "下单");

    const paymentHistory: PaymentRecord[] =
      deposit > 0
        ? [
            {
              date: today,
              amount: deposit,
              method: fields.deposit_office ? OFFICE_PAYMENT_METHOD : fields.deposit_method,
              note: fields.deposit_note || (balance === 0 ? `${type}全款付清` : `${type}定金`) || undefined,
              type: "payment",
              office: fields.deposit_office,
            },
          ]
        : [];

    const matchedClient = findClientByReference(clients, { clientName: fields.client_name.trim(), phone: fields.phone });

    const newOrder: BizOrder = {
      order_number: orderNumber,
      order_type: type,
      client_name: fields.client_name.trim(),
      client_id: matchedClient?.id,
      phone: fields.phone || undefined,
      address: fields.address || undefined,
      description: type === "定制单" ? (fields.description || undefined) : undefined,
      preview_image: type === "定制单" ? fields.preview_image || undefined : undefined,
      total_price: totalPrice,
      amount_paid: deposit,
      balance,
      order_date: today,
      status,
      payment_history: paymentHistory,
      material_rows: type === "批发单" && !noMaterial ? selectedMaterials : undefined,
    };
    onCreate(newOrder);
    onClose();
  }

  const isWholesale = type === "批发单";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className={`w-full ${isWholesale ? "max-w-2xl max-h-[95vh] overflow-y-auto" : "max-w-lg"} rounded-2xl border border-gray-200 bg-gray-50 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-700">
            {editOrder ? `编辑 ${editOrder.order_number}` : `新建${type}`}{isVip ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">VIP</span> : null}
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-slate-400 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                客户名称 *
              </label>
              <input
                type="text"
                list="order-client-options"
                value={fields.client_name}
                onChange={(e) => {
                  const value = e.target.value;
                  set("client_name", value);
                  hydrateClient(value, fields.phone);
                }}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
              />
              <datalist id="order-client-options">{clients.map((item) => <option key={item.id} value={item.name} />)}</datalist>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">联系电话</label>
              <input
                type="tel"
                value={fields.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  set("phone", value);
                  hydrateClient(fields.client_name, value);
                }}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-700">地址</label>
            <input
              type="text"
              value={fields.address}
              onChange={(e) => set("address", e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
            />
          </div>
          {!isWholesale && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">说明</label>
              <textarea
                value={fields.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none resize-none"
              />
            </div>
          )}
          {!isWholesale && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">总价</label>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={fields.total_price}
                onChange={(e) => set("total_price", e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
              />
            </div>
          )}
          {isWholesale && (
            <div>
              {/* No material toggle */}
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={noMaterial}
                  onChange={(e) => { setNoMaterial(e.target.checked); if (e.target.checked) setSelectedMaterials([]); }}
                  className="h-3.5 w-3.5"
                />
                不选物料，直接填总价
              </label>

              {noMaterial ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">总价</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={fields.total_price}
                    onChange={(e) => set("total_price", e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  {/* Material grid selector */}
                  <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                      <span className="text-[11px] font-semibold text-slate-700">
                        选择物料 {isVip ? <span className="ml-1 font-normal text-amber-600">(VIP 价格已启用)</span> : null}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <select
                          value={materialCategoryFilter}
                          onChange={(e) => setMaterialCategoryFilter(e.target.value)}
                          className="h-7 rounded border border-slate-300 px-1.5 text-[10px] text-slate-700 focus:border-gray-200 focus:outline-none"
                        >
                          <option value="">全部分类</option>
                          {materialCategoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select
                          value={materialSupplierFilter}
                          onChange={(e) => setMaterialSupplierFilter(e.target.value)}
                          className="h-7 rounded border border-slate-300 px-1.5 text-[10px] text-slate-700 focus:border-gray-200 focus:outline-none"
                        >
                          <option value="">全部供应商</option>
                          {materialSupplierOptions.map((sup) => <option key={sup} value={sup}>{sup}</option>)}
                        </select>
                        <input
                          type="text"
                          placeholder="搜索..."
                          value={materialSearch}
                          onChange={(e) => setMaterialSearch(e.target.value)}
                          className="h-7 w-28 rounded border border-slate-300 px-2 text-[11px] text-slate-700 focus:border-gray-200 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {filteredMaterials.length === 0 ? (
                        <p className="py-4 text-center text-[11px] text-slate-500">没有匹配的物料</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {filteredMaterials.map((mat) => {
                            const clientVipPrice = getVipPrice(fields.client_name.trim(), mat.name);
                            const displayPrice = clientVipPrice ?? (isVip && mat.vip_sale_price_usd != null ? mat.vip_sale_price_usd : (mat.sale_price_usd ?? 0));
                            const isClientVipPrice = clientVipPrice != null;
                            const alreadyAdded = selectedMaterials.some((r) => r.name === mat.name);
                            const showEditIcon = isVip || isClientVipPrice;
                            const isEditingThis = vipEditMat === mat.name;
                            if (isEditingThis) {
                              return (
                                <div key={mat.id} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
                                    {mat.image ? <img src={imgUrl(mat.image)} alt={mat.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">无图</div>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-medium text-slate-800">{mat.name}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-[10px] text-amber-600">VIP$</span>
                                      <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={vipEditVal}
                                        onChange={(e) => setVipEditVal(e.target.value)}
                                        onBlur={() => { const p = Number(vipEditVal); if (!isNaN(p) && p >= 0) onSaveVipPrice(fields.client_name.trim(), mat.name, p); setVipEditMat(null); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") { const p = Number(vipEditVal); if (!isNaN(p) && p >= 0) onSaveVipPrice(fields.client_name.trim(), mat.name, p); setVipEditMat(null); } else if (e.key === "Escape") setVipEditMat(null); }}
                                        className="h-5 w-16 rounded border border-amber-300 px-1 text-[10px] text-amber-700 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={mat.id}
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => addMaterialToOrder(mat)}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white"
                              >
                                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
                                  {mat.image ? (
                                    <img src={imgUrl(mat.image)} alt={mat.name} className="h-full w-full object-contain" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">无图</div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium text-slate-800">{mat.name} <span className="font-normal text-slate-500">{mat.code}</span></p>
                                  <p className="text-[10px] text-slate-500">
                                    {isClientVipPrice ? "VIP专属价" : "卖出价"}: <span className={`font-semibold ${isClientVipPrice ? "text-amber-600" : "text-slate-700"}`}>${displayPrice}</span>
                                    <span className="ml-2">库存: {mat.stock_quantity}</span>
                                    {showEditIcon && <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVipEditMat(mat.name); setVipEditVal(String(displayPrice)); }} className="ml-1 cursor-pointer text-[9px] text-amber-500 hover:text-amber-700" title="编辑VIP价格">✎</span>}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected materials list */}
                  {selectedMaterials.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">已选物料</p>
                      <div className="space-y-1.5">
                        {selectedMaterials.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-800">{r.name}</p>
                              <p className="text-[10px] text-slate-500">{r.spec || ""}</p>
                            </div>
                            <input
                              type="number"
                              min={1}
                              value={r.qty}
                              onChange={(e) => updateSelectedMaterial(i, "qty", Math.max(1, Number(e.target.value) || 1))}
                              className="h-7 w-14 rounded border border-slate-300 px-1.5 text-center text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                            />
                            <span className="w-14 text-right text-xs text-slate-700">
                              ${(r.qty * r.unit_price).toFixed(2)}
                            </span>
                            <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-600">
                              <input
                                type="checkbox"
                                checked={!!r.is_return}
                                onChange={(e) => updateSelectedMaterial(i, "is_return", e.target.checked)}
                                className="h-3 w-3"
                              />
                              退货
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSelectedMaterial(i)}
                              className="rounded p-0.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-700">总价</span>
                        <span className="text-sm font-bold text-slate-700">{formatMoney(materialTotal)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {type === "定制单" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">参考图片</p>
              <div className="flex items-center gap-3">
                <label className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-[11px] text-slate-700">
                  {fields.preview_image ? <img src={imgUrl(fields.preview_image)} alt="预览" className="h-full w-full object-cover" /> : "上传图片"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePreviewUpload(e.target.files?.[0])} />
                </label>
                <div className="flex-1 text-[11px] text-slate-700">新建定制单时就可以先放一张参考图,后面进订单详情还能继续替换。</div>
              </div>
            </div>
          )}
          {!editOrder && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
              首付 / 定金(可选)
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">金额</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={fields.deposit}
                  onChange={(e) => set("deposit", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">方式</label>
                <select
                  value={fields.deposit_method}
                  disabled={fields.deposit_office}
                  onChange={(e) => set("deposit_method", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">备注</label>
                <input
                  type="text"
                  placeholder="定金备注"
                  value={fields.deposit_note}
                  onChange={(e) => set("deposit_note", e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none"
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={fields.deposit_office} onChange={(e) => setFields((f) => ({ ...f, deposit_office: e.target.checked, deposit_method: e.target.checked ? OFFICE_PAYMENT_METHOD : f.deposit_method }))} /> 这笔收入进入办公室</label>
          </div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
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
            {editOrder ? "保存修改" : "创建订单"}
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
  setSettings,
  onAutoSave,
}: {
  orders: BizOrder[];
  materials: MaterialRecord[];
  clients: ContactRecord[];
  setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>;
  settings: BizSettings;
  setSettings: React.Dispatch<React.SetStateAction<BizSettings>>;
  printArchives: PrintArchiveRecord[];
  setPrintArchives: React.Dispatch<React.SetStateAction<PrintArchiveRecord[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  onAutoSave?: () => void;
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
  const [orderPage, setOrderPage] = useState(1);
  const orderListColumns = ["订单号", "类型", "客户", "描述", "总金额", "下单日期", "状态", "余款", "操作"];
  const [bulkAction, setBulkAction] = useState<null | "pay" | "delete">(null);
  const [bulkBusy, setBulkBusy] = useState(false);


  function handleSave(updated: BizOrder) {
    const matchedClient = findClientByReference(clients, {
      clientId: updated.client_id,
      clientName: updated.client_name,
      phone: updated.phone,
    });
    const normalizedUpdated = { ...updated, client_id: matchedClient?.id };
    setOrders((prev) =>
      prev.map((o) => (o.order_number === updated.order_number ? normalizedUpdated : o))
    );
    setSelectedOrder(normalizedUpdated);
    // When closing order, also void related expenses/cash entries (same as delete)
    if (updated.status === "已关闭") {
      const orderNum = updated.order_number;
      setExpenses((prev) => prev.map((item) =>
        expenseReferencesOrder(item, orderNum) ? { ...item, voided: true } : item
      ));
      setCashEntries((prev) => prev.map((item) =>
        cashEntryReferencesOrder(item, orderNum) ? { ...item, voided: true } : item
      ));
    }
    onAutoSave?.();
  }

  function handleCreate(newOrder: BizOrder) {
    const matchedClient = findClientByReference(clients, {
      clientId: newOrder.client_id,
      clientName: newOrder.client_name,
      phone: newOrder.phone,
    });
    const normalizedOrder = { ...newOrder, client_id: matchedClient?.id };
    setOrders((prev) => [normalizedOrder, ...prev]);
    const depositRecord = normalizedOrder.payment_history?.[0];
    if (depositRecord?.office) {
      setCashEntries((prev) => [{
        id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()),
        type: "收入",
        amount: depositRecord.amount,
        date: depositRecord.date,
        method: OFFICE_PAYMENT_METHOD,
        note: `${normalizedOrder.order_number} 新单定金`,
        office: true,
        order_number: normalizedOrder.order_number,
        order_id: normalizedOrder.order_number,
        source_type: "order-deposit",
        source_id: `${normalizedOrder.order_number}:deposit`,
      }, ...prev]);
    }
    onAutoSave?.();
  }

  function handleDelete(orderNumber: string) {
    setOrders((prev) => prev.map((o) =>
      o.order_number === orderNumber ? { ...o, status: "已作废" } : o
    ));
    setExpenses((prev) => prev.map((item) =>
      expenseReferencesOrder(item, orderNumber) ? { ...item, voided: true } : item
    ));
    setCashEntries((prev) => prev.map((item) =>
      cashEntryReferencesOrder(item, orderNumber) ? { ...item, voided: true } : item
    ));
    setSelectedOrderNumbers((prev) => prev.filter((item) => item !== orderNumber));
    setDeleteConfirm(null);
    onAutoSave?.();
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

  const orderPageSize = 10;
  const orderPageCount = Math.max(1, Math.ceil(filteredOrders.length / orderPageSize));
  const pagedOrders = useMemo(
    () => filteredOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize),
    [filteredOrders, orderPage],
  );
  const currentPageOrderNumbers = pagedOrders.map((order) => order.order_number);

  useEffect(() => {
    setOrderPage(1);
  }, [search, typeFilter, statusFilter, dateFilter, dateFrom, dateTo, showOnlyBalance]);

  useEffect(() => {
    setOrderPage((prev) => Math.min(prev, orderPageCount));
  }, [orderPageCount]);

  const summary = summarizeOrders(filteredOrders);
  const unpaidOrders = useMemo(
    () => orders.filter((order) => (order.balance ?? 0) > 0 && order.status !== "结清" && order.status !== "已关闭" && order.status !== "已作废"),
    [orders],
  );
  const unpaidClientCount = useMemo(() => new Set(unpaidOrders.map((order) => order.client_name)).size, [unpaidOrders]);
  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderNumbers.includes(order.order_number)),
    [orders, selectedOrderNumbers],
  );
  const selectedOutstanding = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + Math.max(0, order.balance ?? 0), 0),
    [selectedOrders],
  );
  const allPagedSelected = currentPageOrderNumbers.length > 0 && currentPageOrderNumbers.every((orderNumber) => selectedOrderNumbers.includes(orderNumber));

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
    const orderNumbers = selectedOrderNumbers;
    setOrders((prev) => prev.map((order) =>
      orderNumbers.includes(order.order_number) ? { ...order, status: "已作废" } : order
    ));
    setExpenses((prev) => prev.map((item) =>
      orderNumbers.some((on) => expenseReferencesOrder(item, on)) ? { ...item, voided: true } : item
    ));
    setCashEntries((prev) => prev.map((item) =>
      orderNumbers.some((on) => cashEntryReferencesOrder(item, on)) ? { ...item, voided: true } : item
    ));
    setSelectedOrderNumbers([]);
    setBulkBusy(false);
    setBulkAction(null);
  }

  function handleSaveVipPrice(clientName: string, materialName: string, price: number) {
    setSettings((prev) => {
      const allPrices: VipPriceRecord[] = prev.vip_prices ? JSON.parse(prev.vip_prices) : [];
      const filtered = allPrices.filter((p) => !(p.client_name === clientName && p.material_name === materialName));
      filtered.push({ client_name: clientName, material_name: materialName, price });
      return { ...prev, vip_prices: JSON.stringify(filtered) };
    });
    setTimeout(() => onAutoSave?.(), 0);
  }

  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        settings={settings}
        materials={materials}
        onBack={() => setSelectedOrder(null)}
        onSave={handleSave}
        onOfficeEntry={(entry) => setCashEntries((prev) => [entry, ...prev])}
        onSaveVipPrice={handleSaveVipPrice}
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
          settings={settings}
          materials={materials}
          onClose={() => setCreateType(null)}
          onCreate={handleCreate}
          onSaveVipPrice={handleSaveVipPrice}
        />
      )}

      <InlineConfirmDialog
        open={bulkAction === "pay"}
        title="批量一键付清"
        description={`将为选中的 ${selectedOrders.length} 个订单自动补齐尾款收款记录,并同步更新余款与状态。当前待收合计 ${formatMoney(selectedOutstanding)}。`}
        confirmLabel="确认付清"
        confirmTone="success"
        loading={bulkBusy}
        onCancel={() => !bulkBusy && setBulkAction(null)}
        onConfirm={handleBulkSettle}
      />
      <InlineConfirmDialog
        open={bulkAction === "delete"}
        title="批量删除订单"
        description={`确认删除选中的 ${selectedOrders.length} 个订单?此操作会直接从当前业务台账中移除这些订单。`}
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
            <button
              onClick={() => setCreateType("定制单")}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              + 新建定制单
            </button>
            <button
              onClick={() => setCreateType("批发单")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700 transition-colors"
            >
              + 新建批发单
            </button>
          </>
        }
      />

      <StatStrip
        items={[
          { label: "全部订单", value: String(summary.total) },
          { label: "定制单", value: String(summary.custom), accent: "text-slate-700" },
          { label: "批发单", value: String(summary.wholesale), accent: "text-indigo-600" },
          { label: "已收款", value: formatMoney(summary.amountPaid), accent: "text-green-600" },
          { label: "未收款", value: formatMoney(summary.balance), accent: "text-red-600" },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索订单号 / 客户名称..."
              className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-700">类别</span>
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
            <span className="text-xs text-slate-700">状态</span>
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
            <span className="text-xs text-slate-700">日期</span>
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
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-red-300 hover:text-red-500 transition-colors"
          >
            ✕ 重置
          </button>
        </div>
        {dateFilter === "自定义" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span>日期范围</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700" />
            <span>至</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700" />
          </div>
        )}
        {selectedOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="text-xs text-sky-700">
              已选 <span className="font-semibold">{selectedOrders.length}</span> 个订单,待收尾款 <span className="font-semibold">{formatMoney(selectedOutstanding)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionBtn tone="success" onClick={() => setBulkAction("pay")}>一键付清尾款</ActionBtn>
              <ActionBtn tone="danger" onClick={() => setBulkAction("delete")}>批量删除</ActionBtn>
              <ActionBtn onClick={() => setSelectedOrderNumbers([])}>清空选择</ActionBtn>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  onChange={() => setSelectedOrderNumbers((prev) => allPagedSelected ? prev.filter((orderNumber) => !currentPageOrderNumbers.includes(orderNumber)) : [...new Set([...prev, ...currentPageOrderNumbers])])}
                  className="cursor-pointer"
                />
              </th>
              {orderListColumns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              pagedOrders.map((order: BizOrder) => {
                return (
                <tr
                  key={order.order_number}
                  className="border-b border-gray-200 last:border-b-0 hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selectedOrderNumbers.includes(order.order_number)}
                      onChange={() => toggleSelection(order.order_number)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {order.order_number}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        order.order_type === "定制单"
                          ? "bg-gray-50 text-slate-800"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {order.order_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{order.client_name}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-slate-700">
                    {order.description || "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{formatMoney(order.total_after_tax ?? order.total_price ?? 0)}</td>
                  <td className="px-3 py-2 text-slate-700">{order.order_date || "-"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={order.status ?? "下单"} />
                  </td>
                  <td className="px-3 py-2 font-medium text-red-600">
                    {formatMoney(order.balance || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-gray-200 hover:text-slate-700 transition-colors"
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
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:border-slate-300 transition-colors"
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
                  className="py-10 text-center text-xs text-slate-700"
                >
                  当前没有可显示的订单数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredOrders.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
          <div>第 {orderPage} / {orderPageCount} 页,共 {filteredOrders.length} 条订单</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOrderPage((page) => Math.max(1, page - 1))}
              disabled={orderPage <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              onClick={() => setOrderPage((page) => Math.min(orderPageCount, page + 1))}
              disabled={orderPage >= orderPageCount}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {!!unpaidOrders.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-rose-700">未付清客户提醒</p>
              <p className="mt-1 text-xs text-rose-600">
                当前有 {unpaidClientCount} 位客户、{unpaidOrders.length} 个订单仍有尾款,待收合计 {formatMoney(unpaidOrders.reduce((sum, order) => sum + (order.balance ?? 0), 0))}
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

      </div>
    </div>
  );
}

// ─── Finance ─────────────────────────────────────────────────────────────────

type FinanceSub = "income" | "expense" | "cash" | "ledger" | "receivables" | "audit" | "transfer";

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
    .split(/\r?\n|,|,/)
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
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none" />;
}

function SmallSelect({ value, onChange, options, labels, disabled = false }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>; disabled?: boolean; }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100">
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
    <div className="rounded-xl border border-slate-200 bg-white p-2">
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
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-700">{title}</h3>
        <p className="mt-2 text-xs leading-5 text-slate-700">{description}</p>
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

function FinanceSection({ orders, setOrders, expenses, setExpenses, cashEntries, setCashEntries, payrolls, setPayrolls, clients, setClients, suppliers, employees, settings, onAutoSave }: {
  orders: BizOrder[];
  setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>;
  expenses: ExpenseRecord[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  cashEntries: CashEntry[];
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  payrolls: PayrollRecord[];
  setPayrolls: React.Dispatch<React.SetStateAction<PayrollRecord[]>>;
  clients: ContactRecord[];
  setClients: React.Dispatch<React.SetStateAction<ContactRecord[]>>;
  suppliers: SupplierRecord[];
  employees: EmployeeRecord[];
  settings: BizSettings;
  onAutoSave?: () => void;
}) {
  const [sub, setSub] = useState<FinanceSub>("income");
  const today = formatLocalDate(new Date());
  const [ledgerView, setLedgerView] = useState<"monthly" | "yearly">("monthly");
  const [ledgerYear, setLedgerYear] = useState(today.slice(0, 4));
  const [ledgerMonth, setLedgerMonth] = useState(today.slice(0, 7));
  const METHOD_OPTIONS = ["现金", "支票", "刷卡", "Zelle"] as const;
  const [activeMethods, setActiveMethods] = useState<string[]>([...METHOD_OPTIONS]);
  const [dateMode, setDateMode] = useState<"range" | "single">("range");
  const expenseTypeOptions = useMemo(() => getExpenseTypeOptions(settings), [settings]);
  const officeTargets = useMemo(() => Array.from(new Set([...suppliers.map((item) => item.name), ...employees.map((item) => item.name), ...clients.map((item) => item.name)])), [suppliers, employees, clients]);
  const [draft, setDraft] = useState<FinanceDraft>({ target: "", detail: "", amount: "", expense_type: expenseTypeOptions[0] ?? "采购", payment_method: "转账", expense_date: today, remark: "" });
  const [auditReport, setAuditReport] = useState<FinanceAuditReport | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [confirmingExpenseId, setConfirmingExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [quickPayTarget, setQuickPayTarget] = useState<string | null>(null);
  const [quickPayFields, setQuickPayFields] = useState({ date: today, amount: "", method: OFFICE_PAYMENT_METHOD, note: "", office: false });
  const [resolvingDuplicateKey, setResolvingDuplicateKey] = useState<string | null>(null);
  function handleMergeDuplicateClients(phoneKey: string, keptName: string) {
    const issues = activeAudit?.issues.filter((item): item is FinanceDuplicateClientIssue =>
      item.kind === "duplicate_client" && item.key === phoneKey
    ) ?? [];
    if (!issues.length) return;
    const namesToMerge = issues[0].clientNames.filter((n: string) => n !== keptName);
    setOrders((prev) => prev.map((order) =>
      namesToMerge.includes(order.client_name) ? { ...order, client_name: keptName } : order
    ));
    setClients((prev) => prev.filter((client) => {
      const phone = normalizePhone(client.phone);
      if (phone !== phoneKey) return true;
      return client.name === keptName;
    }));
    setResolvingDuplicateKey(null);
  }
  const [expenseFromOffice, setExpenseFromOffice] = useState(false);

  useEffect(() => {
    if (!quickPayFields.office || quickPayFields.method === OFFICE_PAYMENT_METHOD) return;
    setQuickPayFields((prev) => ({ ...prev, method: OFFICE_PAYMENT_METHOD }));
  }, [quickPayFields.office, quickPayFields.method]);

  useEffect(() => {
    if (!expenseFromOffice || draft.payment_method === OFFICE_PAYMENT_METHOD) return;
    setDraft((prev) => ({ ...prev, payment_method: OFFICE_PAYMENT_METHOD }));
  }, [expenseFromOffice, draft.payment_method]);
  const [showOfficeTransferModal, setShowOfficeTransferModal] = useState(false);
  const [officeTransferDraft, setOfficeTransferDraft] = useState({ type: "转入", amount: "", date: today, note: "" });
  const [transferInlineDraft, setTransferInlineDraft] = useState({ type: "转入", amount: "", date: today, note: "" });
  const [transferPage, setTransferPage] = useState(1);
  const [financeDateStart, setFinanceDateStart] = useState(today);
  const [financeDateEnd, setFinanceDateEnd] = useState(today);
  const [paymentPage, setPaymentPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const [cashPage, setCashPage] = useState(1);
  const [receivablesPage, setReceivablesPage] = useState(1);
  const paymentRows = orders.flatMap((order) => (order.payment_history ?? []).map((record, index) => ({ order, record, key: `${order.order_number}-${index}` })));
  const getIncomeDetail = (order: BizOrder, record: PaymentRecord) => {
    const note = (record.note ?? "").trim();
    if (note && !/^(定制单|批发单)(定金|收款金?|收款|尾款|退款)?$/.test(note)) return note;
    // If note is auto-generated (e.g. "批发定金"), show it
    if (note && /^(批发单|定制单)(定金|全款付清|收款|退款)$/.test(note)) return note;
    // Fallback to order description/remarks for custom orders
    return order.description?.trim() || order.remarks?.trim() || note || "-";
  };
  const getOfficeNoteParts = (note?: string) => {
    const raw = (note ?? "").trim();
    if (!raw) return { object: "-", detail: "-" };
    if (raw.includes(" - ")) {
      const [detail, object] = raw.split(" - ");
      return { object: (object ?? "-").trim() || "-", detail: (detail ?? "-").trim() || "-" };
    }
    if (raw.includes(" · ")) {
      const [object, detail] = raw.split(" · ");
      return { object: (object ?? "-").trim() || "-", detail: (detail ?? "-").trim() || "-" };
    }
    return { object: "-", detail: raw };
  };
  const filteredPaymentRows = paymentRows.filter(({ record }) => isDateInRange(record.date, financeDateStart, financeDateEnd)).filter(({ record }) => activeMethods.length > 0 && (record.method ? activeMethods.includes(record.method) : false));
  const filteredExpenses = expenses.filter((item) => isDateInRange(item.expense_date, financeDateStart, financeDateEnd)).filter((item) => activeMethods.length > 0 && (item.payment_method ? activeMethods.includes(item.payment_method) : false));
  const officeCashEntries = reconcileCashEntries(cashEntries, orders, expenses).filter((item) => item.office);
  const filteredCashEntries = officeCashEntries.filter((item) => isDateInRange(item.date, financeDateStart, financeDateEnd)).filter((item) => activeMethods.length > 0 && (item.method ? activeMethods.includes(item.method) : false));
  const payrollOverlapsFinanceRange = (month: string) => {
    if (!month) return false;
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    if (financeDateStart && monthEnd < financeDateStart) return false;
    if (financeDateEnd && monthStart > financeDateEnd) return false;
    return true;
  };
  const filteredPayrolls = payrolls.filter((item) => payrollOverlapsFinanceRange(item.month));
  const totalIncome = filteredPaymentRows.reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
  const totalExpense = filteredExpenses.reduce((s, item) => s + item.amount, 0);
  const actualTotalIncome = paymentRows.reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
  const actualTotalExpense = expenses.reduce((s, item) => s + item.amount, 0);
  const totalBalance = orders.reduce((s, o) => s + (o.balance ?? 0), 0);
  const payrollAmount = filteredPayrolls.reduce((s, item) => s + item.net_salary, 0);
  const cashBalance = filteredCashEntries.reduce((s, item) => s + (["收入", "转入"].includes(item.type) ? item.amount : -item.amount), 0);
  const receivableOrders = orders.filter((o) => (o.balance ?? 0) > 0 && o.status !== "已关闭");
  const filteredReceivableOrders = receivableOrders.filter((o) => isDateInRange(o.order_date, financeDateStart, financeDateEnd));
  const paymentPageSize = 10;
  const paymentPageCount = Math.max(1, Math.ceil(filteredPaymentRows.length / paymentPageSize));
  const pagedPaymentRows = filteredPaymentRows.slice((paymentPage - 1) * paymentPageSize, paymentPage * paymentPageSize);
  const expensesPageSize = 10;
  const expensesPageCount = Math.max(1, Math.ceil(filteredExpenses.length / expensesPageSize));
  const pagedExpenses = filteredExpenses.slice((expensesPage - 1) * expensesPageSize, expensesPage * expensesPageSize);
  const cashPageSize = 10;
  const cashPageCount = Math.max(1, Math.ceil(filteredCashEntries.length / cashPageSize));
  const pagedCashEntries = filteredCashEntries.slice((cashPage - 1) * cashPageSize, cashPage * cashPageSize);
  const receivablesPageSize = 10;
  const receivablesPageCount = Math.max(1, Math.ceil(filteredReceivableOrders.length / receivablesPageSize));
  const pagedReceivableOrders = filteredReceivableOrders.slice((receivablesPage - 1) * receivablesPageSize, receivablesPage * receivablesPageSize);
  const allTransferEntries = cashEntries.filter((item) => item.source_type === "office-transfer");
  const filteredTransferEntries = allTransferEntries.filter((item) => isDateInRange(item.date, financeDateStart, financeDateEnd));
  const transferPageSize = 10;
  const transferPageCount = Math.max(1, Math.ceil(filteredTransferEntries.length / transferPageSize));
  const pagedTransferEntries = filteredTransferEntries.slice((transferPage - 1) * transferPageSize, transferPage * transferPageSize);
  useEffect(() => { setPaymentPage(1); setExpensesPage(1); setCashPage(1); setReceivablesPage(1); setTransferPage(1); }, [financeDateStart, financeDateEnd]);
  const financeAuditPreview = useMemo(() => buildFinanceAuditReport(orders, clients), [orders, clients]);
  const activeAudit = auditReport ?? financeAuditPreview;
  const ledgerBalance = (() => {
    // Use all payment/expense data (not date-filtered) to compute cumulative balance for the selected period
    // ledgerRows[0].balance would be the latest cumulative balance
    try {
      // ledgerRows is computed below using the correct year/month filter
      // This IIFE runs at declaration time, so use raw data directly
      const allDays = Array.from(new Set([...paymentRows.map(({ record }) => (record.date ?? "").slice(0, 10)), ...expenses.filter((e) => e.expense_date).map((e) => e.expense_date.slice(0, 10))])).filter(Boolean).sort().reverse();
      const inPeriod = allDays.filter((d) => ledgerView === "yearly" ? d.startsWith(ledgerYear) : d.startsWith(ledgerMonth));
      let cum = 0;
      inPeriod.toReversed().forEach((day) => {
        const income = paymentRows.filter(({ record }) => (record.date ?? "").startsWith(day)).reduce((s, { record }) => s + (record.type === "refund" ? -record.amount : record.amount), 0);
        const expense = expenses.filter((item) => item.expense_date.startsWith(day)).reduce((s, item) => s + item.amount, 0);
        cum += income - expense;
      });
      return cum;
    } catch { return 0; }
  })();
  const ledgerRows = (() => {
    let cumulative = 0;
    const allDays = Array.from(new Set([...paymentRows.map(({ record }) => (record.date ?? "").slice(0, 10)), ...expenses.filter((e) => e.expense_date).map((e) => e.expense_date.slice(0, 10))])).filter(Boolean).sort().reverse();
    if (ledgerView === "yearly") {
      const months = Array.from(new Set(allDays.filter((d) => d.startsWith(ledgerYear)).map((d) => d.slice(0, 7)))).sort().reverse();
      return months.map((month) => {
        const income = paymentRows.filter(({ record }) => (record.date ?? "").startsWith(month)).reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
        const expense = expenses.filter((item) => item.expense_date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
        const net = income - expense;
        cumulative += net;
        return { month, income, expense, net, balance: cumulative, profit: income - expense };
      });
    }
    const days = allDays.filter((d) => d.startsWith(ledgerMonth));
    return days.map((day) => {
      const income = paymentRows.filter(({ record }) => (record.date ?? "").startsWith(day)).reduce((sum, { record }) => sum + (record.type === "refund" ? -record.amount : record.amount), 0);
      const expense = expenses.filter((item) => item.expense_date.startsWith(day)).reduce((sum, item) => sum + item.amount, 0);
      const net = income - expense;
      cumulative += net;
      return { month: day, income, expense, net, balance: cumulative, profit: income - expense };
    });
  })();
  const financeConfigs: Record<FinanceSub, TabularSchemaConfig> = {
    income: {
      title: "订单收入",
      filePrefix: "biz-finance-income",
      columns: ["订单号", "客户", "金额", "支付方式", "日期", "明细", "类型"],
      exportRows: () => mapRows(filteredPaymentRows, ({ order, record }) => [order.order_number, order.client_name, record.amount, record.method, record.date, getIncomeDetail(order, record), record.type === "refund" ? `${order.order_type}退款` : order.order_type]),
      printRows: () => mapRows(filteredPaymentRows, ({ order, record }) => [order.order_number, order.client_name, formatMoney(record.amount), record.method, record.date, getIncomeDetail(order, record), record.type === "refund" ? `${order.order_type}退款` : order.order_type]),
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
      title: ledgerView === "yearly" ? "年度账单" : "月度账单",
      filePrefix: ledgerView === "yearly" ? "biz-finance-yearly" : "biz-finance-ledger",
      columns: ["月份", "收入", "支出", "净额", "余额", "净利润"],
      exportRows: () => mapRows(ledgerRows, (item) => [item.month, item.income, item.expense, item.net, item.balance, item.profit]),
      printRows: () => mapRows(ledgerRows, (item) => [item.month, formatMoney(item.income), formatMoney(item.expense), formatMoney(item.net), formatMoney(item.balance), formatMoney(item.profit)]),
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
    transfer: {
      title: "办公室转账",
      filePrefix: "biz-finance-transfer",
      columns: ["类型", "金额", "日期", "备注"],
      exportRows: () => filteredTransferEntries.map((item) => [item.type, item.amount, item.date, item.note ?? ""]),
      printRows: () => filteredTransferEntries.map((item) => [item.type, formatMoney(item.amount), item.date, item.note ?? "-"]),
    },
  };

  function runFinanceAudit() {
    setAuditReport(buildFinanceAuditReport(orders, clients));
  }

  function applyFinanceRepair() {
    const repaired = applyFinanceAuditRepairs(orders, clients);
    setOrders(repaired.fixedOrders);
    setClients(repaired.fixedClients);
    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));
    onAutoSave?.();
  }

  function handleQuickPay(orderNumber: string) {
    const amount = parseFloat(quickPayFields.amount);
    if (!amount || amount <= 0) return;
    const newRecord: PaymentRecord = {
      date: quickPayFields.date,
      amount,
      method: quickPayFields.office ? OFFICE_PAYMENT_METHOD : quickPayFields.method,
      note: quickPayFields.note || undefined, // note auto-set when order known below
      type: "payment",
      office: quickPayFields.office,
    };
    setOrders((prev) =>
      prev.map((o) => {
        if (o.order_number !== orderNumber) return o;
        const total = o.total_after_tax ?? o.total_price ?? 0;
        const nextPaid = Number(((o.amount_paid ?? 0) + amount).toFixed(2));
        const nextBalance = Math.max(0, Number((total - nextPaid).toFixed(2)));
        const nextStatus = deriveStatus(total, nextPaid, o.status ?? "下单");
        // Auto-generate note if none provided
        const paymentNote = quickPayFields.note || (nextBalance === 0 ? `${o.order_type}全款付清` : `${o.order_type}收款`);
        const finalRecord: PaymentRecord = { ...newRecord, note: paymentNote };
        const nextHistory = [finalRecord, ...(o.payment_history ?? [])];
        return { ...o, payment_history: nextHistory, amount_paid: nextPaid, balance: nextBalance, status: nextStatus };
      }),
    );
    if (quickPayFields.office) {
      setCashEntries((prev) => [{
        id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()),
        type: "收入",
        amount,
        date: quickPayFields.date,
        method: OFFICE_PAYMENT_METHOD,
        note: `${orderNumber} 办公室收款`,
        office: true,
        order_number: orderNumber,
        order_id: orderNumber,
        source_type: "order-payment",
        source_id: `${orderNumber}:${quickPayFields.date}:${amount}:quick-pay`,
      }, ...prev]);
    }
    setQuickPayTarget(null);
    setQuickPayFields({ date: today, amount: "", method: OFFICE_PAYMENT_METHOD, note: "", office: false });
  }

  function openEditExpense(item: ExpenseRecord) {
    setEditingExpenseId(item.id);
    setDraft({ target: item.target, detail: item.detail, amount: String(item.amount), expense_type: item.expense_type, payment_method: item.payment_method, expense_date: item.expense_date, remark: item.remark ?? "" });
    setExpenseFromOffice(item.office ?? false);
    setShowExpenseModal(true);
  }

  function addExpense() {
    const amount = Number(draft.amount) || 0;
    if (!draft.target.trim() || !draft.detail.trim() || amount <= 0) return;
    if (editingExpenseId) {
      const nextExpense: ExpenseRecord = {
        ...(expenses.find((item) => item.id === editingExpenseId) ?? { id: editingExpenseId }),
        id: editingExpenseId,
        target: draft.target.trim(),
        detail: draft.detail.trim(),
        amount,
        expense_type: draft.expense_type,
        payment_method: expenseFromOffice ? OFFICE_PAYMENT_METHOD : draft.payment_method,
        expense_date: draft.expense_date,
        remark: draft.remark || undefined,
        office: expenseFromOffice,
      };
      setExpenses((prev) => prev.map((item) => item.id === editingExpenseId ? nextExpense : item));
      setCashEntries((prev) => {
        const linked = prev.find((item) => item.source_type === "expense" && item.source_id === editingExpenseId);
        if (!expenseFromOffice) {
          return prev.filter((item) => !(item.source_type === "expense" && item.source_id === editingExpenseId));
        }
        if (linked) {
          return prev.map((item) => item.id === linked.id
            ? {
                ...item,
                type: "支出",
                amount,
                date: draft.expense_date,
                note: `${nextExpense.target} · ${nextExpense.detail}`,
                office: true,
              }
            : item);
        }
        return [{
          id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()),
          type: "支出",
          amount,
          date: draft.expense_date,
          note: `${nextExpense.target} · ${nextExpense.detail}`,
          office: true,
          source_type: "expense",
          source_id: editingExpenseId,
        }, ...prev];
      });
    } else {
      const expenseId = nextYearScopedId(expenses.map((item) => item.id), "EXP", new Date().getFullYear());
      const record: ExpenseRecord = {
        id: expenseId,
        target: draft.target.trim(),
        detail: draft.detail.trim(),
        amount,
        expense_type: draft.expense_type,
        payment_method: expenseFromOffice ? OFFICE_PAYMENT_METHOD : draft.payment_method,
        expense_date: draft.expense_date,
        remark: draft.remark || undefined,
        office: expenseFromOffice,
      };
      setExpenses((prev) => [record, ...prev]);
      if (expenseFromOffice) {
        setCashEntries((prev) => [{
          id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()),
          type: "支出",
          amount,
          date: draft.expense_date,
          method: OFFICE_PAYMENT_METHOD,
          note: `${record.target} · ${record.detail}`,
          office: true,
          source_type: "expense",
          source_id: expenseId,
        }, ...prev]);
      }
    }
    setEditingExpenseId(null);
    setDraft({ target: "", detail: "", amount: "", expense_type: expenseTypeOptions[0] ?? "采购", payment_method: "转账", expense_date: today, remark: "" });
    setExpenseFromOffice(false);
    setShowExpenseModal(false);
    onAutoSave?.();
  }

  function deleteExpense(expenseId: string) {
    const removedExpense = expenses.find((item) => item.id === expenseId);
    setExpenses((prev) => prev.filter((item) => item.id !== expenseId));
    setCashEntries((prev) => prev.filter((item) => !(item.source_type === "expense" && item.source_id === expenseId)));
    if (removedExpense?.expense_type === "工资") {
      setPayrolls((prev) => prev.map((item) => item.expense_id === expenseId
        ? {
            ...item,
            payment_status: "未发放",
            paid_at: undefined,
            expense_id: undefined,
          }
        : item));
    }
    setConfirmingExpenseId(null);
    onAutoSave?.();
  }

  function addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: officeTransferDraft.type, amount, date: officeTransferDraft.date, method: OFFICE_PAYMENT_METHOD, note: officeTransferDraft.note || undefined, office: true, source_type: "office-transfer", source_id: `${officeTransferDraft.type}:${officeTransferDraft.date}:${amount}` }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, note: "" });
    setShowOfficeTransferModal(false);
    onAutoSave?.();
  }

  function addTransferEntry() {
    const amount = Number(transferInlineDraft.amount) || 0;
    if (amount <= 0) return;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: transferInlineDraft.type, amount, date: transferInlineDraft.date, method: OFFICE_PAYMENT_METHOD, note: transferInlineDraft.note || undefined, office: true, source_type: "office-transfer", source_id: `${transferInlineDraft.type}:${transferInlineDraft.date}:${amount}` }, ...prev]);
    setTransferInlineDraft((d) => ({ ...d, amount: "", note: "" }));
    onAutoSave?.();
  }

  return (
    <div>
      <SectionHeader eyebrow="Finance Management" title="收支管理" actions={<>{sub === "audit" ? <ActionBtn onClick={runFinanceAudit}>↻ 重新扫描</ActionBtn> : null}{sub === "audit" ? <ActionBtn tone="success" onClick={applyFinanceRepair}>🔧 应用自动修复</ActionBtn> : null}{sub === "expense" ? <ActionBtn tone="primary" onClick={() => setShowExpenseModal(true)}>+ 录入支出</ActionBtn> : null}{sub === "cash" ? <ActionBtn tone="primary" onClick={() => setShowOfficeTransferModal(true)}>+ 办公室转入/转出</ActionBtn> : null}</>} />
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <p className="text-sm font-semibold text-slate-700">📅</p>
            <p className="text-xs text-slate-500">{today}</p>
            <div className="flex flex-wrap items-end gap-1.5">
              {!(sub === "ledger" || sub === "audit") && (
                <>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500">开始</p>
                    <SmallInput value={financeDateStart} onChange={(v: string) => { setFinanceDateStart(v); if (dateMode === "single") setFinanceDateEnd(v); }} type="date" />
                  </div>
                  {dateMode === "range" && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500">结束</p>
                    <SmallInput value={financeDateEnd} onChange={setFinanceDateEnd} type="date" />
                  </div>
                  )}
                  <div className="flex items-center gap-1 self-end pb-[2px]">
                    <button onClick={() => setDateMode("single")} className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${dateMode === "single" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>单日</button>
                    <button onClick={() => setDateMode("range")} className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${dateMode === "range" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>区间</button>
                  </div>
                  <ActionBtn onClick={() => { setFinanceDateStart(today); setFinanceDateEnd(today); }}>今天</ActionBtn>
                  <ActionBtn onClick={() => { setFinanceDateStart(""); setFinanceDateEnd(""); }}>全部</ActionBtn>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sub === "income" ? <div className="rounded bg-emerald-50 px-3 py-1.5"><span className="text-xs text-emerald-600">收入 <strong>{formatMoney(totalIncome)}</strong> <span className="text-slate-400">/ 总计 {formatMoney(actualTotalIncome)}</span></span></div> : null}
            {sub === "expense" ? <div className="rounded bg-rose-50 px-3 py-1.5"><span className="text-xs text-rose-600">支出 <strong>{formatMoney(totalExpense)}</strong> <span className="text-slate-400">/ 总计 {formatMoney(actualTotalExpense)}</span></span></div> : null}
            {sub === "cash" ? <div className="rounded bg-slate-50 px-3 py-1.5"><span className="text-xs text-slate-600">办公室 <strong>{formatMoney(cashBalance)}</strong></span></div> : null}
            {sub === "ledger" ? <div className="rounded bg-slate-50 px-3 py-1.5"><span className="text-xs text-slate-600">余额 <strong>{formatMoney(ledgerBalance)}</strong></span></div> : null}
            {sub === "receivables" ? <div className="rounded bg-amber-50 px-3 py-1.5"><span className="text-xs text-amber-600">应收 <strong>{formatMoney(filteredReceivableOrders.reduce((sum, item) => sum + (item.balance ?? 0), 0))}</strong></span></div> : null}
            {sub === "audit" ? <div className="rounded bg-rose-50 px-3 py-1.5"><span className="text-xs text-rose-600">问题 <strong>{activeAudit.autoFixableCount}</strong></span></div> : null}

          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {sub === "ledger" ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={ledgerYear} onChange={(e) => setLedgerYear(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700">
                {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => <option key={y}>{y}</option>)}
              </select>
              {ledgerView === "monthly" && (
                <select value={ledgerMonth} onChange={(e) => setLedgerMonth(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700">
                  {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => <option key={m} value={`${ledgerYear}-${m}`}>{m}月</option>)}
                </select>
              )}
            </div>
          ) : sub !== "audit" && sub !== "cash" && sub !== "receivables" ? (
            <div className="flex flex-wrap items-center gap-2">
              {METHOD_OPTIONS.map(m => (
                <label key={m} className="flex cursor-pointer items-center gap-1">
                  <input type="checkbox" checked={activeMethods.includes(m)} onChange={() => setActiveMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])} className="h-3 w-3 accent-slate-700" />
                  <span className="text-[11px] text-slate-600">{m}</span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={activeMethods.length === METHOD_OPTIONS.length} onChange={() => setActiveMethods(prev => prev.length === METHOD_OPTIONS.length ? [] : [...METHOD_OPTIONS])} className="h-3 w-3 accent-slate-700" />
                <span className="text-[11px] font-medium text-slate-700">全选</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap border-b-2 border-slate-200 bg-white self-start">
        {FINANCE_SUBS.map((t) => <button key={t.key} onClick={() => setSub(t.key)} className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${sub === t.key ? "border-gray-200 text-slate-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>)}
      </div>


      {sub === "ledger" && (
        <SegmentedControl
          options={[
            { key: "monthly", label: "月度" },
            { key: "yearly", label: "年度" },
          ]}
          value={ledgerView}
          onChange={setLedgerView}
        />
      )}
      {sub === "audit" && (
        <div className="mb-4">
          <PanelCard title="财务体检中心" note="自动对比收款记录与订单字段,发现不一致后一键修复：① 按收款记录重算已付金额 ② 计算正确余款 ③ 更新订单状态(下单/未付清/已付清/已关闭) ④ 同步客户余额与订单应收。">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-rose-500">订单异常</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{activeAudit.orderIssueCount}</p>
                <p className="mt-1 text-xs text-rose-600">检查已付金额、余款和状态是否与收款记录一致</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-500">客户账龄</p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">{activeAudit.clientIssueCount}</p>
                <p className="mt-1 text-xs text-amber-600">同步客户档案余额,避免客户中心与应收款看板脱节</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-500">重复客户线索</p>
                <p className="mt-2 text-2xl font-semibold text-sky-700">{activeAudit.duplicateClientCount}</p>
                <p className="mt-1 text-xs text-sky-600">按手机号提示疑似重复客户,保留人工判断</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-500">可自动修复</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{activeAudit.autoFixableCount}</p>
                <p className="mt-1 text-xs text-emerald-600">一键修复 → 重算已付/余款/状态 + 客户余额同步,扫描时间 {activeAudit.scannedAt.slice(0, 16).replace("T", " ")}</p>
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
                <p className="mt-1 text-xs text-slate-500">这里只记录办公室抽屉里的现金进出,不影响公司总账。</p>
              </div>
              <button onClick={() => setShowOfficeTransferModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SmallSelect value={officeTransferDraft.type} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, type: v }))} options={["转入", "转出"]} />
              <SmallInput value={officeTransferDraft.amount} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" />
              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注(可选)" />
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
                <h3 className="text-base font-semibold text-slate-900">{editingExpenseId ? "编辑支出" : "录入支出"}</h3>
                <p className="mt-1 text-xs text-slate-500">现金付款会自动补一条现金流水。</p>
              </div>
              <button onClick={() => { setShowExpenseModal(false); setEditingExpenseId(null); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <input list="expense-target-options" value={draft.target} onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} placeholder="对象 / 供应商 / 员工" className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none" />
                <datalist id="expense-target-options">{officeTargets.map((item) => <option key={item} value={item} />)}</datalist>
              </div>
              <SmallInput value={draft.detail} onChange={(v) => setDraft((d) => ({ ...d, detail: v }))} placeholder="支出明细" />
              <SmallInput value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} type="number" placeholder="金额" />
              <SmallSelect value={draft.expense_type} onChange={(v) => setDraft((d) => ({ ...d, expense_type: v }))} options={expenseTypeOptions} />
              <SmallSelect value={draft.payment_method} onChange={(v) => setDraft((d) => ({ ...d, payment_method: v }))} options={PAYMENT_METHODS} disabled={expenseFromOffice} />
              <SmallInput value={draft.expense_date} onChange={(v) => setDraft((d) => ({ ...d, expense_date: v }))} type="date" />
            </div>
            <div className="mt-2"><SmallInput value={draft.remark} onChange={(v) => setDraft((d) => ({ ...d, remark: v }))} placeholder="备注(可选)" /></div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={expenseFromOffice} onChange={(e) => { const checked = e.target.checked; setExpenseFromOffice(checked); if (checked) setDraft((d) => ({ ...d, payment_method: OFFICE_PAYMENT_METHOD })); }} /> 这笔支出从办公室抽屉里出</label>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => { setShowExpenseModal(false); setEditingExpenseId(null); }}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addExpense}>确认录入</ActionBtn>
            </div>
          </div>
        </div>
      )}
      {sub === "income" && (<><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2 font-semibold text-slate-600">订单号</th><th className="px-4 py-2 font-semibold text-slate-600">客户</th><th className="px-4 py-2 font-semibold text-slate-600">金额</th><th className="px-4 py-2 font-semibold text-slate-600">支付方式</th><th className="px-4 py-2 font-semibold text-slate-600">日期</th><th className="px-4 py-2 font-semibold text-slate-600">明细</th></tr></thead><tbody>{filteredPaymentRows.length ? pagedPaymentRows.map(({ key, order, record }) => <tr key={key} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2 font-medium text-slate-700">{order.order_number}</td><td className="px-4 py-2 text-slate-700">{order.client_name}</td><td className={`px-4 py-2 font-semibold ${record.type === "refund" ? "text-rose-600" : "text-green-600"}`}>{record.type === "refund" ? "-" : "+"}{formatMoney(record.amount)}</td><td className="px-4 py-2 text-slate-600">{record.method}</td><td className="px-4 py-2 text-slate-500">{record.date}</td><td className="px-4 py-2 text-slate-500">{getIncomeDetail(order, record)}</td></tr>) : <tr><td colSpan={6} className="py-10 text-center text-xs text-slate-400">这个日期范围内没有收入记录</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><span>第 {paymentPage} / {paymentPageCount} 页,共 {filteredPaymentRows.length} 条收款</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPaymentPage((p) => Math.max(1, p - 1))} disabled={paymentPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setPaymentPage((p) => Math.min(paymentPageCount, p + 1))} disabled={paymentPage >= paymentPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div></>)}
      {sub === "expense" && (<><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2 font-semibold text-slate-600">对象</th><th className="px-4 py-2 font-semibold text-slate-600">明细</th><th className="px-4 py-2 font-semibold text-slate-600">金额</th><th className="px-4 py-2 font-semibold text-slate-600">类型</th><th className="px-4 py-2 font-semibold text-slate-600">方式</th><th className="px-4 py-2 font-semibold text-slate-600">办公室</th><th className="px-4 py-2 font-semibold text-slate-600">日期</th><th className="px-4 py-2 font-semibold text-slate-600">操作</th></tr></thead><tbody>{filteredExpenses.length ? pagedExpenses.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2 text-slate-700">{item.target}</td><td className="px-4 py-2 text-slate-500">{item.detail}</td><td className="px-4 py-2 font-semibold text-rose-600">{formatMoney(item.amount)}</td><td className="px-4 py-2 text-slate-600">{item.expense_type}</td><td className="px-4 py-2 text-slate-600">{item.payment_method}</td><td className="px-4 py-2 text-slate-600">{item.office ? "是" : "否"}</td><td className="px-4 py-2 text-slate-500">{item.expense_date}</td><td className="px-4 py-2"><div className="flex items-center gap-2">{editingExpenseId === item.id ? <span className="text-xs text-slate-400">编辑中</span> : <><button onClick={() => openEditExpense(item)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">编辑</button>{confirmingExpenseId === item.id ? <><button onClick={() => deleteExpense(item.id)} className="rounded border border-red-400 bg-red-500 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingExpenseId(null)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingExpenseId(item.id)} className="rounded border border-red-100 px-2 py-0.5 text-xs text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors">删除</button>}</>}</div></td></tr>) : <tr><td colSpan={8} className="py-10 text-center text-xs text-slate-400">这个日期范围内没有支出记录</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><span>第 {expensesPage} / {expensesPageCount} 页,共 {filteredExpenses.length} 条支出</span><div className="flex items-center gap-2"><button type="button" onClick={() => setExpensesPage((p) => Math.max(1, p - 1))} disabled={expensesPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setExpensesPage((p) => Math.min(expensesPageCount, p + 1))} disabled={expensesPage >= expensesPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div></>)}
      {sub === "cash" && (<><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2 font-semibold text-slate-600">类型</th><th className="px-4 py-2 font-semibold text-slate-600">对象</th><th className="px-4 py-2 font-semibold text-slate-600">金额</th><th className="px-4 py-2 font-semibold text-slate-600">日期</th><th className="px-4 py-2 font-semibold text-slate-600">明细</th></tr></thead><tbody>{filteredCashEntries.length ? pagedCashEntries.map((item) => { const parts = getOfficeNoteParts(item.note); return (<tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${["收入", "转入"].includes(item.type) ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"}`}>{item.type}</span></td><td className="px-4 py-2 text-slate-700">{parts.object}</td><td className={`px-4 py-2 font-semibold ${["收入", "转入"].includes(item.type) ? "text-green-600" : "text-rose-600"}`}>{formatMoney(item.amount)}</td><td className="px-4 py-2 text-slate-500">{item.date}</td><td className="px-4 py-2 text-slate-500">{parts.detail}</td></tr>); }) : <tr><td colSpan={5} className="py-10 text-center text-xs text-slate-400">这个日期范围内没有现金流水</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><span>第 {cashPage} / {cashPageCount} 页,共 {filteredCashEntries.length} 条现金</span><div className="flex items-center gap-2"><button type="button" onClick={() => setCashPage((p) => Math.max(1, p - 1))} disabled={cashPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setCashPage((p) => Math.min(cashPageCount, p + 1))} disabled={cashPage >= cashPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div></>)}

      {sub === "ledger" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2 font-semibold text-slate-600">{ledgerView === "yearly" ? "月份" : "日期"}</th><th className="px-4 py-2 font-semibold text-slate-600">收入</th><th className="px-4 py-2 font-semibold text-slate-600">支出</th><th className="px-4 py-2 font-semibold text-slate-600">净额</th><th className="px-4 py-2 font-semibold text-slate-600">余额</th><th className="px-4 py-2 font-semibold text-slate-600">净利润</th></tr></thead><tbody>{ledgerRows.map((item) => <tr key={item.month} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-2 font-medium text-slate-700">{item.month}</td><td className="px-4 py-2 text-green-600">{formatMoney(item.income)}</td><td className="px-4 py-2 text-rose-600">{formatMoney(item.expense)}</td><td className="px-4 py-2 text-slate-700">{formatMoney(item.net)}</td><td className="px-4 py-2 text-emerald-600">{formatMoney(item.balance)}</td><td className={`px-4 py-2 font-semibold ${item.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatMoney(item.profit)}</td></tr>)}</tbody></table></div>}
      {sub === "receivables" && (
        <div className="space-y-3">
          {filteredReceivableOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-400">暂无未收款订单</div>
          ) : (
            <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2 font-semibold text-slate-600">客户</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">订单号</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">总额</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">已付</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">余款</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">下单日期</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">账龄</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedReceivableOrders.map((o) => {
                    const agingDays = diffReceivableDays(o.order_date);
                    const agingBucket = getReceivableBucket(agingDays);
                    const isExpanded = quickPayTarget === o.order_number;
                    return (
                      <>
                        <tr key={o.order_number} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2 text-slate-700">{o.client_name}</td>
                          <td className="px-4 py-2 font-medium text-slate-700">{o.order_number}</td>
                          <td className="px-4 py-2 text-slate-700">{formatMoney(o.total_after_tax ?? o.total_price ?? 0)}</td>
                          <td className="px-4 py-2 font-medium text-green-600">{formatMoney(o.amount_paid ?? 0)}</td>
                          <td className="px-4 py-2 font-semibold text-red-600">{formatMoney(o.balance ?? 0)}</td>
                          <td className="px-4 py-2 text-slate-500">{o.order_date || "-"}</td>
                          <td className="px-4 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${agingBucket.tone}`}>
                              {agingDays}天
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  setQuickPayTarget(null);
                                } else {
                                  setQuickPayTarget(o.order_number);
                                  setQuickPayFields({ date: today, amount: String(o.balance ?? ""), method: OFFICE_PAYMENT_METHOD, note: "", office: false });
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
                                    disabled={quickPayFields.office}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, method: e.target.value }))}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
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
                                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={quickPayFields.office} onChange={(e) => setQuickPayFields((prev) => ({ ...prev, office: e.target.checked, method: e.target.checked ? OFFICE_PAYMENT_METHOD : prev.method }))} /> 进入办公室</label>
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><span>第 {receivablesPage} / {receivablesPageCount} 页,共 {filteredReceivableOrders.length} 条待收款</span><div className="flex items-center gap-2"><button type="button" onClick={() => setReceivablesPage((p) => Math.max(1, p - 1))} disabled={receivablesPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setReceivablesPage((p) => Math.min(receivablesPageCount, p + 1))} disabled={receivablesPage >= receivablesPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
            </>
          )}
        </div>
      )}
      {sub === "audit" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 font-semibold text-slate-600">类型</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">对象</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">问题</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">当前值</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">建议值</th>
                </tr>
              </thead>
              <tbody>
                {activeAudit.issues.length ? activeAudit.issues.map((item) => (
                  item.kind === "duplicate_client" ? (
                    <tr key={`dup-${item.key}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2"><span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">重复客户</span></td>
                      <td className="px-4 py-2 font-medium text-slate-700">{item.clientNames.join(" / ")}</td>
                      <td className="px-4 py-2 text-slate-600">{item.issue}</td>
                      <td className="px-4 py-2 text-slate-500">手机号 {item.key}</td>
                      <td className="px-4 py-2">
                        {resolvingDuplicateKey === item.key ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {item.clientNames.map((name: string) => (
                              <button
                                key={name}
                                onClick={() => handleMergeDuplicateClients(item.key, name)}
                                className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors whitespace-nowrap"
                              >保留 &quot;{name}&quot;</button>
                            ))}
                            <button
                              onClick={() => setResolvingDuplicateKey(null)}
                              className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-300 transition-colors"
                            >取消</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setResolvingDuplicateKey(item.key)}
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
                          >合并</button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={`${item.kind}-${item.kind === "order" ? item.orderNumber : item.clientId}-${item.issue}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.kind === "order" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{item.kind === "order" ? "订单" : "客户"}</span></td>
                      <td className="px-4 py-2 font-medium text-slate-700">{item.kind === "order" ? `${item.orderNumber} / ${item.clientName}` : item.clientName}</td>
                      <td className="px-4 py-2 text-slate-600">{item.issue}</td>
                      <td className="px-4 py-2 text-slate-500">{item.currentValue}</td>
                      <td className="px-4 py-2 font-medium text-emerald-700">{item.suggestedValue}</td>
                    </tr>
                  )
                )) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-emerald-600">当前没有发现财务异常,可以放心继续收款与对账。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <p>自动修复范围:重算订单已付金额、余款、状态,并同步客户档案余额。重复客户仅做提示,不自动删除,避免误伤真实共享电话的家庭或公司客户。</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

type ContactSub = "clients" | "suppliers";
type ClientDetailTab = "overview" | "orders" | "appointments" | "activity";

function ClientsSection({ clients, setClients, suppliers, setSuppliers, orders, setOrders, appointments, setAppointments, setCashEntries, setExpenses, materials, setMaterials, settings, setSettings, onAutoSave }: { clients: ContactRecord[]; setClients: React.Dispatch<React.SetStateAction<ContactRecord[]>>; suppliers: SupplierRecord[]; setSuppliers: React.Dispatch<React.SetStateAction<SupplierRecord[]>>; orders: BizOrder[]; setOrders: React.Dispatch<React.SetStateAction<BizOrder[]>>; appointments: MeasurementAppointmentRecord[]; setAppointments: React.Dispatch<React.SetStateAction<MeasurementAppointmentRecord[]>>; setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>; setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>; materials: MaterialRecord[]; setMaterials: React.Dispatch<React.SetStateAction<MaterialRecord[]>>; settings: BizSettings; setSettings: React.Dispatch<React.SetStateAction<BizSettings>>; onAutoSave?: () => void; }) {
  const [sub, setSub] = useState<ContactSub>("clients");
  const today = formatLocalDate(new Date());
  const [clientDraft, setClientDraft] = useState({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
  const supplierCategoryOptions = useMemo(() => getSupplierCategoryOptions(settings), [settings]);
  const [supplierDraft, setSupplierDraft] = useState({ name: "", category: supplierCategoryOptions[0] ?? "布料", contact_person: "", phone: "", email: "", website: "", address: "", remark: "" });
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showVipPriceModal, setShowVipPriceModal] = useState(false);
  const [vipPriceClient, setVipPriceClient] = useState<(typeof clients)[number] | null>(null);
  const [vipPriceDraft, setVipPriceDraft] = useState<Record<string, number>>({});
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [confirmingClientId, setConfirmingClientId] = useState<string | null>(null);
  const [confirmingSupplierId, setConfirmingSupplierId] = useState<string | null>(null);
  const [directoryHint, setDirectoryHint] = useState("");
  const [clientDetailTab, setClientDetailTab] = useState<ClientDetailTab>("overview");
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const suppliersPageSize = 10;
  const suppliersPageCount = Math.max(1, Math.ceil(suppliers.length / suppliersPageSize));
  const pagedSuppliers = suppliers.slice((suppliersPage - 1) * suppliersPageSize, suppliersPage * suppliersPageSize);
  useEffect(() => { setSuppliersPage(1); }, [suppliers]);
  const [clientOrdersPage, setClientOrdersPage] = useState(1);
  const [clientPaymentsPage, setClientPaymentsPage] = useState(1);
  const [clientFeedPage, setClientFeedPage] = useState(1);
  const [clientReceivablePage, setClientReceivablePage] = useState(1);
  const [newOrderTypeForClient, setNewOrderTypeForClient] = useState<"定制单" | "批发单" | null>(null);
  const [selectedClientOrderDetail, setSelectedClientOrderDetail] = useState<BizOrder | null>(null);
  const [editOrderForClient, setEditOrderForClient] = useState<BizOrder | null>(null);
  const [deleteOrderConfirm, setDeleteOrderConfirm] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [clientAppointmentsPage, setClientAppointmentsPage] = useState(1);
  const [confirmingDeleteAppointmentId, setConfirmingDeleteAppointmentId] = useState<string | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<MeasurementAppointmentRecord | null>(null);
  const [appointmentDraft, setAppointmentDraft] = useState({ appointment_date: new Date().toISOString().slice(0, 10), appointment_time: '', phone: '', address: '', description: '' });
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? "");
  const [quickCollectDraft, setQuickCollectDraft] = useState({ orderNumber: "", amount: "", date: today, method: OFFICE_PAYMENT_METHOD, note: "", office: false });

  useEffect(() => {
    if (!quickCollectDraft.office || quickCollectDraft.method === OFFICE_PAYMENT_METHOD) return;
    setQuickCollectDraft((prev) => ({ ...prev, method: OFFICE_PAYMENT_METHOD }));
  }, [quickCollectDraft.office, quickCollectDraft.method]);
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

  function addClient() {
    if (!clientDraft.name.trim()) return;
    if (editingClientId) {
      const originalClient = clients.find((item) => item.id === editingClientId);
      const nextName = clientDraft.name.trim();
      const nextPhone = clientDraft.phone || undefined;
      const nextAddress = clientDraft.address || undefined;
      setClients((prev) => prev.map((item) => item.id === editingClientId ? { ...item, name: nextName, contact: clientDraft.contact || undefined, phone: nextPhone, wechat: clientDraft.wechat || undefined, address: nextAddress, note: clientDraft.note || undefined } : item));
      if (originalClient) {
        setOrders((prev) => prev.map((item) => orderBelongsToClient(item, originalClient) ? { ...item, client_name: nextName, client_id: originalClient.id, phone: nextPhone, address: nextAddress } : item));
      }
      setSelectedClientId(editingClientId);
      setDirectoryHint(`已同步客户 ${nextName} 的订单关联。`);
    } else {
      const newId = nextSequentialId(clients.map((item) => item.id), "CL");
      setClients((prev) => [{ id: newId, name: clientDraft.name.trim(), contact: clientDraft.contact || undefined, phone: clientDraft.phone || undefined, wechat: clientDraft.wechat || undefined, address: clientDraft.address || undefined, note: clientDraft.note || undefined, created_at: today, balance: 0, is_vip: false }, ...prev]);
      setSelectedClientId(newId);
      setDirectoryHint(`已新增客户 ${clientDraft.name.trim()}。`);
    }
    setEditingClientId(null);
    setClientDraft({ name: "", contact: "", phone: "", wechat: "", address: "", note: "" });
    setShowClientModal(false);
    onAutoSave?.();
  }

  function openEditClient(client: ContactRecord) {
    setEditingClientId(client.id);
    setClientDraft({ name: client.name, contact: client.contact ?? "", phone: client.phone ?? "", wechat: client.wechat ?? client.email ?? "", address: client.address ?? "", note: client.note ?? "" });
    setShowClientModal(true);
  }

  function deleteClient(client: ContactRecord) {
    const linkedOrders = orders.filter((item) => orderBelongsToClient(item, client));
    if (linkedOrders.length) {
      setDirectoryHint(`客户 ${client.name} 还有 ${linkedOrders.length} 个订单,先处理这些记录再删。`);
      setConfirmingClientId(null);
      return;
    }
    setClients((prev) => prev.filter((item) => item.id !== client.id));
    if (selectedClientId === client.id) setSelectedClientId("");
    setDirectoryHint(`已删除客户 ${client.name}。`);
    setConfirmingClientId(null);
    onAutoSave?.();
  }

  function addSupplier() {
    if (!supplierDraft.name.trim()) return;
    if (editingSupplierId) {
      const originalSupplier = suppliers.find((item) => item.id === editingSupplierId);
      const nextName = supplierDraft.name.trim();
      setSuppliers((prev) => prev.map((item) => item.id === editingSupplierId ? { ...item, name: nextName, category: supplierDraft.category, contact_person: supplierDraft.contact_person || undefined, phone: supplierDraft.phone || undefined, email: supplierDraft.email || undefined, website: supplierDraft.website || undefined, address: supplierDraft.address || undefined, remark: supplierDraft.remark || undefined } : item));
      if (originalSupplier) {
        setMaterials((prev) => prev.map((item) => materialBelongsToSupplier(item, originalSupplier) ? { ...item, supplier: nextName, supplier_id: originalSupplier.id } : item));
      }
      setDirectoryHint(`已同步供应商 ${nextName} 的物料关联。`);
    } else {
      setSuppliers((prev) => [{ id: nextSequentialId(prev.map((item) => item.id), "SUP"), name: supplierDraft.name.trim(), category: supplierDraft.category, contact_person: supplierDraft.contact_person || undefined, phone: supplierDraft.phone || undefined, email: supplierDraft.email || undefined, website: supplierDraft.website || undefined, address: supplierDraft.address || undefined, remark: supplierDraft.remark || undefined, last_purchase_date: today }, ...prev]);
      setDirectoryHint(`已新增供应商 ${supplierDraft.name.trim()}。`);
    }
    setSupplierDraft({ name: "", category: supplierCategoryOptions[0] ?? "布料", contact_person: "", phone: "", email: "", website: "", address: "", remark: "" });
    setEditingSupplierId(null);
    setShowSupplierModal(false);
    onAutoSave?.();
  }

  function openEditSupplier(supplier: SupplierRecord) {
    setEditingSupplierId(supplier.id);
    setSupplierDraft({ name: supplier.name, category: supplier.category ?? supplierCategoryOptions[0] ?? "布料", contact_person: supplier.contact_person ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "", website: supplier.website ?? "", address: supplier.address ?? "", remark: supplier.remark ?? "" });
    setShowSupplierModal(true);
  }

  function deleteSupplier(supplier: SupplierRecord) {
    const linkedMaterials = materials.filter((item) => materialBelongsToSupplier(item, supplier));
    if (linkedMaterials.length) {
      setDirectoryHint(`供应商 ${supplier.name} 还有 ${linkedMaterials.length} 个物料关联,先处理这些记录再删。`);
      setConfirmingSupplierId(null);
      return;
    }
    setSuppliers((prev) => prev.filter((item) => item.id !== supplier.id));
    setDirectoryHint(`已删除供应商 ${supplier.name}。`);
    setConfirmingSupplierId(null);
    onAutoSave?.();
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
        .filter((item) => orderBelongsToClient(item, selectedClient))
        .sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")))
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

  const clientOrdersPageSize = 10;
  const clientOrdersPageCount = Math.max(1, Math.ceil(selectedClientOrders.length / clientOrdersPageSize));
  const pagedClientOrders = selectedClientOrders.slice((clientOrdersPage - 1) * clientOrdersPageSize, clientOrdersPage * clientOrdersPageSize);

  const clientPaymentsPageSize = 10;
  const clientPaymentsPageCount = Math.max(1, Math.ceil(clientRecentPayments.length / clientPaymentsPageSize));
  const pagedClientPayments = clientRecentPayments.slice((clientPaymentsPage - 1) * clientPaymentsPageSize, clientPaymentsPage * clientPaymentsPageSize);

  const clientFeedPageSize = 10;
  const clientFeedPageCount = Math.max(1, Math.ceil(clientBusinessFeed.length / clientFeedPageSize));
  const pagedClientFeed = clientBusinessFeed.slice((clientFeedPage - 1) * clientFeedPageSize, clientFeedPage * clientFeedPageSize);

  const clientReceivablePageSize = 10;
  const clientReceivablePageCount = Math.max(1, Math.ceil(receivableOrders.length / clientReceivablePageSize));
  const pagedReceivableOrders = receivableOrders.slice((clientReceivablePage - 1) * clientReceivablePageSize, clientReceivablePage * clientReceivablePageSize);

  const selectedClientAppointments = selectedClient ? appointments.filter((item) => appointmentBelongsToClient(item, selectedClient)).sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date))) : [];
  const clientAppointmentsPageSize = 10;
  const clientAppointmentsPageCount = Math.max(1, Math.ceil(selectedClientAppointments.length / clientAppointmentsPageSize));
  const pagedClientAppointments = selectedClientAppointments.slice((clientAppointmentsPage - 1) * clientAppointmentsPageSize, clientAppointmentsPage * clientAppointmentsPageSize);

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    setClientDetailTab("overview");
  }

  function toggleVip(clientId: string) {
    setClients((prev) => prev.map((item) => item.id === clientId ? { ...item, is_vip: !item.is_vip } : item));
  }

  function openVipPriceEditor(client: (typeof clients)[number]) {
    setVipPriceClient(client);
    const allPrices: VipPriceRecord[] = settings.vip_prices ? JSON.parse(settings.vip_prices) : [];
    const clientPrices = allPrices.filter((p) => p.client_name === client.name);
    const draft: Record<string, number> = {};
    for (const p of clientPrices) {
      draft[p.material_name] = p.price;
    }
    // Pre-fill all materials with their current effective price
    for (const mat of materials) {
      if (draft[mat.name] === undefined) {
        draft[mat.name] = mat.vip_sale_price_usd ?? mat.sale_price_usd ?? 0;
      }
    }
    setVipPriceDraft(draft);
    setShowVipPriceModal(true);
  }

  function saveVipPrices() {
    if (!vipPriceClient) return;
    const allPrices: VipPriceRecord[] = settings.vip_prices ? JSON.parse(settings.vip_prices) : [];
    const filtered = allPrices.filter((p) => p.client_name !== vipPriceClient.name);
    for (const [materialName, price] of Object.entries(vipPriceDraft)) {
      if (price > 0) {
        filtered.push({ client_name: vipPriceClient.name, material_name: materialName, price });
      }
    }
    const updatedSettings = { ...settings, vip_prices: JSON.stringify(filtered) };
    setSettings(updatedSettings);
    onAutoSave?.();
    setShowVipPriceModal(false);
    setVipPriceClient(null);
    setVipPriceDraft({});
  }

  function removeVipPrice(materialName: string) {
    setVipPriceDraft((prev) => {
      const next = { ...prev };
      delete next[materialName];
      return next;
    });
  }

  function getVipPriceForMaterial(clientName: string, materialName: string): number | null {
    try {
      const allPrices: VipPriceRecord[] = settings.vip_prices ? JSON.parse(settings.vip_prices) : [];
      const match = allPrices.find((p) => p.client_name === clientName && p.material_name === materialName);
      return match ? match.price : null;
    } catch { return null; }
  }

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch]);

  useEffect(() => {
    if (clientPage > clientPageCount) setClientPage(clientPageCount);
  }, [clientPage, clientPageCount]);

  useEffect(() => {
    setClientOrdersPage(1);
    setClientPaymentsPage(1);
    setClientFeedPage(1);
    setClientReceivablePage(1);
    setDeleteOrderConfirm(null);
  }, [selectedClient?.id]);

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

  function handleSaveVipPrice(clientName: string, materialName: string, price: number) {
    setSettings((prev) => {
      const allPrices: VipPriceRecord[] = prev.vip_prices ? JSON.parse(prev.vip_prices) : [];
      const filtered = allPrices.filter((p) => !(p.client_name === clientName && p.material_name === materialName));
      filtered.push({ client_name: clientName, material_name: materialName, price });
      return { ...prev, vip_prices: JSON.stringify(filtered) };
    });
    setTimeout(() => onAutoSave?.(), 0);
  }

  function handleClientOrderCreate(order: BizOrder) {
    setOrders((prev) => [order, ...prev]);
    setNewOrderTypeForClient(null);
  }

  function handleClientOrderUpdate(order: BizOrder) {
    setOrders((prev) => prev.map((o) => o.order_number === order.order_number ? order : o));
    setSelectedClientOrderDetail(null);
  }

  function handleClientDetailSave(updated: BizOrder) {
    setOrders((prev) => prev.map((o) => o.order_number === updated.order_number ? updated : o));
    setSelectedClientOrderDetail(null);
  }

  function handleClientOrderDelete(orderNumber: string) {
    setOrders((prev) => prev.map((o) =>
      o.order_number === orderNumber ? { ...o, status: "已作废" } : o
    ));
    setCashEntries((prev) => prev.map((item) =>
      cashEntryReferencesOrder(item, orderNumber) ? { ...item, voided: true } : item
    ));
    setExpenses((prev) => prev.map((item) =>
      expenseReferencesOrder(item, orderNumber) ? { ...item, voided: true } : item
    ));
    setDeleteOrderConfirm(null);
  }

  function handleClientOrderPrint(item: BizOrder, printType: "invoice" | "pickup") {
    const rows = item.material_rows ?? [];
    const draft: DraftFields = {
      client_name: item.client_name ?? "",
      phone: item.phone ?? "",
      address: item.address ?? "",
      preview_image: item.preview_image ?? "",
      total_price: item.total_price ?? 0,
      tax_rate: item.tax_rate ?? 0,
      discount: 0,
      description: item.description ?? "",
      install_info: "",
      remarks: item.remarks ?? "",
    };
    const html = printType === "invoice"
      ? buildCustomerInvoiceHTML(item, draft, rows, settings)
      : buildWorkerPickupHTML(item, rows, settings);
    openPrintWindow(html);
  }

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
      method: quickCollectDraft.office ? OFFICE_PAYMENT_METHOD : quickCollectDraft.method,
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
        id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()),
        type: "收入",
        amount: Number(amount.toFixed(2)),
        date: quickCollectDraft.date,
        method: OFFICE_PAYMENT_METHOD,
        note: `${selectedClient.name} ${selectedCollectOrder.order_number} 收款`,
        office: true,
        order_number: selectedCollectOrder.order_number,
        order_id: selectedCollectOrder.order_number,
        source_type: "order-payment",
        source_id: `${selectedCollectOrder.order_number}:${quickCollectDraft.date}:${Number(amount.toFixed(2))}:client-center`,
      }, ...prev]);
    }
    setQuickCollectDraft((prev) => ({
      ...prev,
      orderNumber: "",
      amount: "",
      date: today,
      method: OFFICE_PAYMENT_METHOD,
      note: "",
      office: false,
    }));
    onAutoSave?.();
  }

  return (
    <div>
      <SectionHeader
        eyebrow="客户管理"
        title="客户与供应商"
        actions={
          <>
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
          { label: "双角色主体", value: String(clients.filter((item) => directoryBadgeLabel(item, suppliers, "客户") === "客户 / 供应商").length), accent: "text-violet-600" },
          { label: "有欠款客户", value: String(clients.filter((item) => (item.balance ?? 0) > 0).length), accent: "text-amber-600" },
        ]}
      />

      <SegmentedControl options={[{ key: "clients", label: "客户档案" }, { key: "suppliers", label: "供应商" }]} value={sub} onChange={(value) => {
        setSub(value as ContactSub);
        setDirectoryHint("");
      }} />

      {directoryHint ? <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">{directoryHint}</div> : null}

      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-700">{editingClientId ? "编辑客户" : "新建客户"}</h3>
                <p className="mt-1 text-xs text-slate-700">客户资料现在支持直接新增和编辑。</p>
              </div>
              <button onClick={() => setShowClientModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">客户名称</label><SmallInput value={clientDraft.name} onChange={(v) => setClientDraft((d) => ({ ...d, name: v }))} placeholder="客户名称" /></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">联系人</label><SmallInput value={clientDraft.contact} onChange={(v) => setClientDraft((d) => ({ ...d, contact: v }))} placeholder="联系人" /></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">电话</label><SmallInput value={clientDraft.phone} onChange={(v) => setClientDraft((d) => ({ ...d, phone: v }))} placeholder="电话" /></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">微信 / 邮箱</label><SmallInput value={clientDraft.wechat} onChange={(v) => setClientDraft((d) => ({ ...d, wechat: v }))} placeholder="微信 / 邮箱" /></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">地址</label><SmallInput value={clientDraft.address} onChange={(v) => setClientDraft((d) => ({ ...d, address: v }))} placeholder="地址" /></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-700">备注</label><SmallInput value={clientDraft.note} onChange={(v) => setClientDraft((d) => ({ ...d, note: v }))} placeholder="备注" /></div>
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
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-700">{editingSupplierId ? "编辑供应商" : "新建供应商"}</h3>
                <p className="mt-1 text-xs text-slate-700">供应商资料现在也支持直接新增和编辑。</p>
              </div>
              <button onClick={() => setShowSupplierModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
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

      {showVipPriceModal && vipPriceClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-gray-50 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-700">VIP 价格 · {vipPriceClient.name}</h3>
                <p className="mt-1 text-xs text-slate-700">设置此 VIP 客户对每个物料的独有价格。设了价格的物料会在批发单中自动使用此价格。</p>
              </div>
              <button onClick={() => setShowVipPriceModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-700">物料列表</p>
                {materials.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无可选物料</p>
                ) : (
                  materials.map((mat) => {
                    const currentDisplayPrice = vipPriceDraft[mat.name] ?? mat.vip_sale_price_usd ?? mat.sale_price_usd ?? 0;
                    return (
                      <div key={mat.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800">{mat.name}</p>
                          <p className="text-[10px] text-slate-500">
                            售价: ${mat.sale_price_usd ?? 0}{mat.vip_sale_price_usd != null ? ` / VIP全局: $${mat.vip_sale_price_usd}` : ""} / 客户价: ${currentDisplayPrice}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={currentDisplayPrice}
                            onChange={(e) => setVipPriceDraft((prev) => ({ ...prev, [mat.name]: Number(e.target.value) || 0 }))}
                            className="h-7 w-20 rounded border border-slate-300 px-2 text-xs text-slate-700 text-center focus:border-gray-200 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {Object.keys(vipPriceDraft).length > 0 && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-[10px] font-semibold text-blue-700">已设价格 ({Object.keys(vipPriceDraft).length} 项)</p>
                  <div className="mt-1 space-y-1">
                    {Object.entries(vipPriceDraft).map(([name, price]) => (
                      <div key={name} className="flex items-center justify-between text-xs text-blue-800">
                        <span>{name}</span>
                        <span className="font-semibold">${price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <ActionBtn onClick={() => { setShowVipPriceModal(false); setVipPriceClient(null); setVipPriceDraft({}); }}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={saveVipPrices}>保存 VIP 价格</ActionBtn>
            </div>
          </div>
        </div>
      )}


      {sub === "clients" ? (
        <div className="space-y-3 xl:space-y-2">
          <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-stretch">
            <PanelCard title="客户列表">
              <div className="space-y-3">
                {selectedClient ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{selectedClient.name}</span>
                          {selectedClient.is_vip ? <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">VIP</span> : null}
                          {clientBalance > 0 ? <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">待跟进</span> : null}
                        </div>
                        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
                          <span>联系人 {selectedClient.contact ?? "-"} · 电话 {selectedClient.phone ?? "-"}</span>
                          <span>微信/邮箱 {selectedClient.wechat ?? selectedClient.email ?? "-"} · 地址 {selectedClient.address ?? "-"}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        <ActionBtn onClick={() => toggleVip(selectedClient.id)}>{selectedClient.is_vip ? "取消VIP" : "设为VIP"}</ActionBtn>
                        {selectedClient.is_vip ? <ActionBtn onClick={() => openVipPriceEditor(selectedClient)}>VIP价格</ActionBtn> : null}
                        <ActionBtn onClick={() => openEditClient(selectedClient)}>编辑</ActionBtn>
                        {confirmingClientId === selectedClient.id ? (
                          <>
                            <button onClick={() => deleteClient(selectedClient)} className="rounded-lg border border-red-500 bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors">确认</button>
                            <button onClick={() => setConfirmingClientId(null)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300 transition-colors">取消</button>
                          </>
                        ) : (
                          <ActionBtn tone="danger" onClick={() => setConfirmingClientId(selectedClient.id)}>删除</ActionBtn>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-700">⌕</span>
                  <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="搜索客户 / 电话 / 地址" className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" />
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-22rem)]">
                  {pagedClients.length ? pagedClients.map((item) => {
                    const itemOrders = orders.filter((order) => orderBelongsToClient(order, item));
                    const itemBalance = itemOrders.reduce((sum, order) => sum + (order.balance ?? 0), 0);
                    const isActive = selectedClient?.id === item.id;
                    return (
                      <button key={item.id} onClick={() => selectClient(item.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${isActive ? "border-sky-300 bg-sky-50" : "border-gray-200 bg-gray-50 hover:border-gray-200 hover:bg-gray-50"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-700">{item.name}</span>
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{directoryBadgeLabel(item, suppliers, "客户")}</span>
                              {item.is_vip ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">VIP</span> : null}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-700">{item.phone ?? item.contact ?? "暂未填写联系方式"}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${itemBalance > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {itemBalance > 0 ? `欠款 ${formatMoney(itemBalance)}` : "已结清"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-700">
                          <span>{itemOrders.length} 个订单</span>
                        </div>
                      </button>
                    );
                  }) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-700">没有匹配到客户</div>}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span>第 {clientPage} / {clientPageCount} 页,共 {filteredClients.length} 个客户</span>
                  <div className="flex gap-2">
                    <ActionBtn onClick={() => setClientPage((prev) => Math.max(1, prev - 1))}>上一页</ActionBtn>
                    <ActionBtn onClick={() => setClientPage((prev) => Math.min(clientPageCount, prev + 1))}>下一页</ActionBtn>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title={selectedClient ? `客户详情 · ${selectedClient.name}` : "客户详情"}>
              {selectedClientOrderDetail ? (
                <OrderDetailView
                  order={selectedClientOrderDetail}
                  settings={settings}
                  materials={materials}
                  onBack={() => setSelectedClientOrderDetail(null)}
                  onSave={handleClientDetailSave}
                  onOfficeEntry={(entry) => setCashEntries((prev) => [entry, ...prev])}
                  onSaveVipPrice={handleSaveVipPrice}
                />
              ) : selectedClient ? (
                <div className="flex flex-col gap-4 xl:h-[calc(100vh-22rem)]">

                  <StatStrip
                    items={[
                      { label: "订单数", value: String(selectedClientOrders.length) },
                      { label: "定制 / 批发", value: `${clientCustomOrderCount} / ${clientWholesaleOrderCount}` },
                      { label: "业务总额", value: formatMoney(clientTotal), accent: "text-slate-800" },
                      { label: "已收 / 余款", value: `${formatMoney(clientPaid)} / ${formatMoney(clientBalance)}`, accent: clientBalance > 0 ? "text-amber-600" : "text-emerald-600" },
                    ]}
                  />

                  <SegmentedControl
                    options={[
                      { key: "overview", label: "总览" },
                      { key: "orders", label: "订单" },
                      { key: "appointments", label: "量尺寸" },
                      { key: "activity", label: "业务动态" },
                    ]}
                    value={clientDetailTab}
                    onChange={(value) => setClientDetailTab(value as ClientDetailTab)}
                  />

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {clientDetailTab === "overview" ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-700">业务状态</p>
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="flex items-center justify-between"><span className="text-slate-500">最近下单</span><span className="font-medium text-slate-700">{clientLastOrder}</span></div>
                        <div className="flex items-start justify-between"><span className="text-slate-500">备注</span><span className="max-w-[200px] text-right text-slate-600">{selectedClient.note ?? "-"}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-700">收款情况</p>
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="flex items-center justify-between"><span className="text-slate-500">未收余款</span><span className={`font-semibold ${clientBalance > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatMoney(clientBalance)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">未结清订单</span><span className="font-medium text-slate-700">{clientOrderCountWithBalance}</span></div>
                        <div className="flex items-start justify-between"><span className="text-slate-500">最近收款</span><span className="max-w-[160px] text-right font-medium text-slate-700">{clientLastPayment ? `${clientLastPayment.date} · ${formatMoney(clientLastPayment.amount)}` : "暂无收款"}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">档案余额</span><span className="font-medium text-slate-700">{formatMoney(selectedClient.balance ?? clientBalance)}</span></div>
                      </div>
                    </div>
                  </div>
                    ) : null}

                    {newOrderTypeForClient && selectedClient && (
                      <NewOrderModal
                  type={newOrderTypeForClient}
                  existingOrders={orders}
                  clients={clients}
                  settings={settings}
                  materials={materials}
                  onClose={() => { setNewOrderTypeForClient(null); }}
                  onCreate={handleClientOrderCreate}
                  initialClientName={selectedClient.name}
                  initialPhone={selectedClient.phone ?? undefined}
                  onSaveVipPrice={handleSaveVipPrice}
                />
                    )}

                    {clientDetailTab === "orders" ? (
                      <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-slate-700">快速收款</p>
                            <p className="text-[11px] text-slate-700">选中未结清订单，录入收款金额</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${receivableOrders.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {receivableOrders.length ? `${receivableOrders.length} 个未结清` : "全部结清"}
                          </span>
                        </div>
                        {receivableOrders.length ? (
                          <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-700">订单</label>
                                <select value={quickCollectDraft.orderNumber} onChange={(e) => {
                                  const nextOrder = receivableOrders.find((item) => item.order_number === e.target.value);
                                  setQuickCollectDraft((prev) => ({ ...prev, orderNumber: e.target.value, amount: nextOrder ? String(nextOrder.balance ?? "") : prev.amount }));
                                }} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700">
                                  {receivableOrders.map((item) => <option key={item.order_number} value={item.order_number}>{item.order_number} · {formatMoney(item.balance ?? 0)}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-700">金额</label>
                                <input type="number" min={0} step={0.01} value={quickCollectDraft.amount} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, amount: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="0.00" />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-700">日期</label>
                                <input type="date" value={quickCollectDraft.date} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, date: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-slate-700">方式</label>
                                <select value={quickCollectDraft.method} disabled={quickCollectDraft.office} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, method: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100">
                                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                              <div className="space-y-2">
                                <input type="text" value={quickCollectDraft.note} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, note: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="备注" />
                                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={quickCollectDraft.office} onChange={(e) => setQuickCollectDraft((prev) => ({ ...prev, office: e.target.checked, method: e.target.checked ? OFFICE_PAYMENT_METHOD : prev.method }))} /> 进入办公室</label>
                              </div>
                              <div className="flex flex-wrap gap-2">
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
                              {pagedReceivableOrders.map((item) => (
                                <button key={item.order_number} onClick={() => applyQuickCollectPreset("balance", item)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors ${selectedCollectOrder?.order_number === item.order_number ? "border-sky-300 bg-sky-50" : "border-gray-200 bg-gray-50 hover:border-gray-200 hover:bg-gray-50"}`}>
                                  <div>
                                    <p className="font-semibold text-slate-700">{item.order_number}</p>
                                    <p className="mt-1 text-[11px] text-slate-700">{item.order_date ?? "-"} · {item.status ?? "-"}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-amber-600">{formatMoney(item.balance ?? 0)}</p>
                                    <p className="mt-1 text-[11px] text-slate-700">点一下自动填入余款</p>
                                  </div>
                                </button>
                              ))}
                              {clientReceivablePageCount > 1 && (
                                <div className="flex items-center justify-between pt-1 text-xs text-slate-700">
                                  <span>第 {clientReceivablePage} / {clientReceivablePageCount} 页</span>
                                  <div className="flex gap-1">
                                    <ActionBtn onClick={() => setClientReceivablePage((p) => Math.max(1, p - 1))} disabled={clientReceivablePage <= 1}>上一页</ActionBtn>
                                    <ActionBtn onClick={() => setClientReceivablePage((p) => Math.min(clientReceivablePageCount, p + 1))} disabled={clientReceivablePage >= clientReceivablePageCount}>下一页</ActionBtn>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-emerald-600">这个客户当前没有未收款订单</div>}
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-700">关联订单</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-700">状态与金额联动</span>
                            <div className="flex items-center gap-1.5">
                            <button onClick={() => setNewOrderTypeForClient("定制单")} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-700 transition-colors">+ 新建定制单</button>
                            <button onClick={() => setNewOrderTypeForClient("批发单")} className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 transition-colors">+ 新建批发单</button>
                            </div>
                          </div>
                        </div>
                        {selectedClientOrders.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                  <th className="px-3 py-2 font-semibold text-slate-600">订单号</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">类型</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">总额</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">已收</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">余款</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">图片</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedClientOrders.map((item) => (
                                  <tr key={item.order_number} className="border-b border-gray-200 last:border-b-0">
                                    <td className="px-3 py-2 font-medium text-slate-700">{item.order_number}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.order_type}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.order_date ?? "-"}</td>
                                    <td className="px-3 py-2 text-slate-700">{formatMoney(item.total_after_tax ?? item.total_price ?? 0)}</td>
                                    <td className="px-3 py-2 text-emerald-600">{formatMoney(item.amount_paid ?? 0)}</td>
                                    <td className={`px-3 py-2 font-semibold ${(item.balance ?? 0) > 0 ? "text-amber-600" : "text-slate-700"}`}>{formatMoney(item.balance ?? 0)}</td>
                                    <td className="px-3 py-2">
                                      {(item.order_images ?? []).length > 0 ? (
                                        <button onClick={() => setLightboxImage((item.order_images ?? [])[0]!)} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-gray-50 transition-colors">查看</button>
                                      ) : <span className="text-[11px] text-slate-700">-</span>}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap items-center gap-1">
                                        {(item.balance ?? 0) > 0 ? <button onClick={() => applyQuickCollectPreset("balance", item)} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">收清</button> : <span className="text-[11px] text-emerald-600">已结清</span>}
                                        <button onClick={() => setSelectedClientOrderDetail(item)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 transition-colors">编辑</button>
                                        <button onClick={() => handleClientOrderPrint(item, "invoice")} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors" title="打印发票单">发票</button>
                                        {item.order_type === "批发单" ? <button onClick={() => handleClientOrderPrint(item, "pickup")} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors" title="打印领料单">领料</button> : null}
                                        {deleteOrderConfirm === item.order_number ? (
                                          <>
                                            <button onClick={() => handleClientOrderDelete(item.order_number)} className="rounded-md border border-red-400 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100">确认</button>
                                            <button onClick={() => setDeleteOrderConfirm(null)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300">取消</button>
                                          </>
                                        ) : (
                                          <button onClick={() => setDeleteOrderConfirm(item.order_number)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-slate-700 hover:border-rose-300 hover:text-rose-600 transition-colors">删除</button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {clientOrdersPageCount > 1 && (
                              <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-slate-700">
                                <span>第 {clientOrdersPage} / {clientOrdersPageCount} 页,共 {selectedClientOrders.length} 条</span>
                                <div className="flex gap-1">
                                  <ActionBtn onClick={() => setClientOrdersPage((p) => Math.max(1, p - 1))} disabled={clientOrdersPage <= 1}>上一页</ActionBtn>
                                  <ActionBtn onClick={() => setClientOrdersPage((p) => Math.min(clientOrdersPageCount, p + 1))} disabled={clientOrdersPage >= clientOrdersPageCount}>下一页</ActionBtn>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-700">这个客户还没有关联订单</div>}
                      </div>
                    </div>
                  </div>
                    ) : null}

                    {clientDetailTab === "appointments" ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">量尺寸</p>
                          <button onClick={() => { setEditingAppointment(null); setAppointmentDraft({ appointment_date: new Date().toISOString().slice(0, 10), appointment_time: '', phone: selectedClient?.phone ?? '', address: selectedClient?.address ?? '', description: '' }); setShowAppointmentModal(true); }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-700 transition-colors">+ 新建预约</button>
                        </div>
                        {selectedClientAppointments.length ? (
                          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                  <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">时间</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">电话</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">地址</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">描述</th>
                                  <th className="px-3 py-2 font-semibold text-slate-600">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedClientAppointments.map((item) => (
                                  <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                                    <td className="px-3 py-2 text-slate-700">{item.appointment_date}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.appointment_time ?? "-"}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.phone ?? "-"}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.address ?? "-"}</td>
                                    <td className="px-3 py-2 text-slate-700">{item.description ?? "-"}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap items-center gap-1">
                                        <button onClick={() => { setEditingAppointment(item); setAppointmentDraft({ appointment_date: item.appointment_date, appointment_time: item.appointment_time ?? '', phone: item.phone ?? '', address: item.address ?? '', description: item.description ?? '' }); setShowAppointmentModal(true); }} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 transition-colors">编辑</button>
                                        {confirmingDeleteAppointmentId === item.id ? (
                                          <>
                                            <button onClick={() => { setAppointments((prev) => prev.filter((a) => a.id !== item.id)); setConfirmingDeleteAppointmentId(null); }} className="rounded-md border border-red-400 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100">确认</button>
                                            <button onClick={() => setConfirmingDeleteAppointmentId(null)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300">取消</button>
                                          </>
                                        ) : (
                                          <button onClick={() => setConfirmingDeleteAppointmentId(item.id)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-slate-700 hover:border-rose-300 hover:text-rose-600 transition-colors">删除</button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {clientAppointmentsPageCount > 1 && (
                              <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-slate-700">
                                <span>第 {clientAppointmentsPage} / {clientAppointmentsPageCount} 页,共 {selectedClientAppointments.length} 条</span>
                                <div className="flex gap-1">
                                  <ActionBtn onClick={() => setClientAppointmentsPage((p) => Math.max(1, p - 1))} disabled={clientAppointmentsPage <= 1}>上一页</ActionBtn>
                                  <ActionBtn onClick={() => setClientAppointmentsPage((p) => Math.min(clientAppointmentsPageCount, p + 1))} disabled={clientAppointmentsPage >= clientAppointmentsPageCount}>下一页</ActionBtn>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-700">这个客户还没有量尺寸记录</div>}
                        {showAppointmentModal && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
                            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <h3 className="text-base font-semibold text-slate-700">{editingAppointment ? "编辑预约" : "新建预约"}</h3>
                                <button onClick={() => setShowAppointmentModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">日期</label>
                                  <input type="date" value={appointmentDraft.appointment_date} onChange={(e) => setAppointmentDraft((d) => ({ ...d, appointment_date: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">时间</label>
                                  <input type="time" value={appointmentDraft.appointment_time} onChange={(e) => setAppointmentDraft((d) => ({ ...d, appointment_time: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">电话</label>
                                  <input type="text" value={appointmentDraft.phone} onChange={(e) => setAppointmentDraft((d) => ({ ...d, phone: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="客户电话" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">地址</label>
                                  <input type="text" value={appointmentDraft.address} onChange={(e) => setAppointmentDraft((d) => ({ ...d, address: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="量尺地址" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">描述</label>
                                  <input type="text" value={appointmentDraft.description} onChange={(e) => setAppointmentDraft((d) => ({ ...d, description: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="备注说明" />
                                </div>
                              </div>
                              <div className="mt-5 flex justify-end gap-2">
                                <ActionBtn onClick={() => setShowAppointmentModal(false)}>取消</ActionBtn>
                                <ActionBtn tone="primary" onClick={() => {
                                  if (!appointmentDraft.appointment_date) return;
                                  if (editingAppointment) {
                                    setAppointments((prev) => prev.map((a) => a.id === editingAppointment.id ? { ...a, appointment_date: appointmentDraft.appointment_date, appointment_time: appointmentDraft.appointment_time || undefined, phone: appointmentDraft.phone || undefined, address: appointmentDraft.address || undefined, description: appointmentDraft.description || undefined } : a));
                                  } else {
                                    const newId = nextSequentialId(appointments.map((a) => a.id), "APT");
                                    setAppointments((prev) => [{ id: newId, client_name: selectedClient?.name ?? "", client_id: selectedClient?.id, phone: appointmentDraft.phone || selectedClient?.phone || undefined, appointment_date: appointmentDraft.appointment_date, appointment_time: appointmentDraft.appointment_time || undefined, address: appointmentDraft.address || undefined, description: appointmentDraft.description || undefined }, ...prev]);
                                  }
                                  setShowAppointmentModal(false);
                                  setEditingAppointment(null);
                                }}>确认</ActionBtn>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {clientDetailTab === "activity" ? (
                      <div className="grid gap-3">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">业务时间线</p>
                        <span className="text-[11px] text-slate-700">订单、收款放在一起看</span>
                      </div>
                      {clientBusinessFeed.length ? (
                        <div className="space-y-2">
                          {pagedClientFeed.map((item) => (
                            <div key={item.key} className="rounded-lg border border-slate-200 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-semibold ${item.tone}`}>{item.label}</span>
                                <span className="text-[11px] text-slate-700">{item.date}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-700">{item.detail}</p>
                            </div>
                          ))}
                          {clientFeedPageCount > 1 && (
                            <div className="flex items-center justify-between pt-1 text-xs text-slate-700">
                              <span>第 {clientFeedPage} / {clientFeedPageCount} 页</span>
                              <div className="flex gap-1">
                                <ActionBtn onClick={() => setClientFeedPage((p) => Math.max(1, p - 1))} disabled={clientFeedPage <= 1}>上一页</ActionBtn>
                                <ActionBtn onClick={() => setClientFeedPage((p) => Math.min(clientFeedPageCount, p + 1))} disabled={clientFeedPage >= clientFeedPageCount}>下一页</ActionBtn>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-700">暂时还没有关联动态</div>}
                    </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-700">请先在左侧选择一个客户,再看详情</div>}
            </PanelCard>
          </div>
        </div>
      ) : (
        <div className="space-y-3 xl:space-y-2">
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 xl:max-h-[calc(100vh-18rem)] xl:overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2 font-semibold text-slate-600">供应商名称</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">分类</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">联系人</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">电话</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">网站</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">地址</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">最近采购</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedSuppliers.map((item) => (
                  <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                    <td className="px-4 py-2 font-medium text-slate-700"><div className="flex flex-wrap items-center gap-2"><span>{item.name}</span><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{directoryBadgeLabel(item, clients, "供应商")}</span></div></td>
                    <td className="px-4 py-2 text-slate-600">{item.category ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-600">{item.contact_person ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-600">{item.phone ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-600">{item.email ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-600">{item.website ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-700">{item.address ?? "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEditSupplier(item)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">编辑</button>
                        {confirmingSupplierId === item.id ? <><button onClick={() => deleteSupplier(item)} className="rounded border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingSupplierId(null)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300 transition-colors">取消</button></> : <button onClick={() => setConfirmingSupplierId(item.id)} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-600"><span>第 {suppliersPage} / {suppliersPageCount} 页,共 {suppliers.length} 条供应商</span><div className="flex items-center gap-2"><button type="button" onClick={() => setSuppliersPage((p) => Math.max(1, p - 1))} disabled={suppliersPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setSuppliersPage((p) => Math.min(suppliersPageCount, p + 1))} disabled={suppliersPage >= suppliersPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
        </div>
      )}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLightboxImage(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img src={`http://43.166.250.145/pic/${lightboxImage}`} alt="order image" className="max-h-[85vh] max-w-[85vw] rounded-xl border-4 border-white object-contain shadow-2xl" />
            <button onClick={() => setLightboxImage(null)} className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-lg hover:bg-gray-100">X</button>
          </div>
        </div>
      )}
    </div>
  );
}

type MaterialSub = "inventory";

function normalizeInventoryToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[(【].*?[)】]/g, " ")
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

function MaterialsSection({ materials, setMaterials, suppliers, orders, setExpenses, setCashEntries, materialCategoryOptions, onAutoSave }: { materials: MaterialRecord[]; setMaterials: React.Dispatch<React.SetStateAction<MaterialRecord[]>>; suppliers: SupplierRecord[]; orders: BizOrder[]; setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>; setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>; materialCategoryOptions: string[]; onAutoSave?: () => void; }) {
  const [sub, setSub] = useState<MaterialSub>("inventory");
  const today = formatLocalDate(new Date());
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [confirmingMaterialId, setConfirmingMaterialId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState({ code: "", name: "", specification: "", size: "", unit: "个", stock_quantity: "", factory_price_rmb: "", weight: "", usd_cost: "", sale_price_usd: "", vip_sale_price_usd: "", supplier: suppliers[0]?.name ?? "", image: "", remark: "", color: "", material: "", other: "", category: "" });
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [inventoryHint, setInventoryHint] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const distinctSuppliers = useMemo(() => [...new Set(materials.map((m) => m.supplier).filter(Boolean))].sort() as string[], [materials]);
  const distinctMonths = useMemo(() => [...new Set(materials.filter((m) => m.last_stock_date).map((m) => m.last_stock_date!.substring(0, 7)))].sort().reverse(), [materials]);
  const inventoryRows = useMemo(() => materials.filter((m) => {
    if (nameFilter && !m.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (categoryFilter && m.category !== categoryFilter) return false;
    if (supplierFilter && m.supplier !== supplierFilter) return false;
    if (monthFilter && (!m.last_stock_date || m.last_stock_date.substring(0, 7) !== monthFilter)) return false;
    return true;
  }), [materials, nameFilter, categoryFilter, supplierFilter, monthFilter]);
  const inventoryPageSize = 24;
  const inventoryPageCount = Math.max(1, Math.ceil(inventoryRows.length / inventoryPageSize));
  const pagedInventoryRows = inventoryRows.slice((inventoryPage - 1) * inventoryPageSize, inventoryPage * inventoryPageSize);
  useEffect(() => { setInventoryPage(1); }, [inventoryRows]);

  function resetMaterialDraft() {
    setMaterialDraft({ code: "", name: "", specification: "", size: "", unit: "个", stock_quantity: "", factory_price_rmb: "", weight: "", usd_cost: "", sale_price_usd: "", vip_sale_price_usd: "", supplier: suppliers[0]?.name ?? "", image: "", remark: "", color: "", material: "", other: "", category: "" });
    setEditingMaterialId(null);
  }

  function syncMaterialCosts(nextFactory: string, nextWeight: string, nextSale?: string) {
    const factory = Number(nextFactory) || 0;
    const weight = Number(nextWeight) || 1;
    const usd = calcUsdCost(factory, weight);
    setMaterialDraft((d) => ({ ...d, factory_price_rmb: nextFactory, weight: nextWeight, usd_cost: String(usd), sale_price_usd: nextSale ?? d.sale_price_usd }));
  }

  async function handleMaterialImageUpload(file?: File | null) {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
    setMaterialDraft((d) => ({ ...d, image: String(res.filename || "") }));
  }

  function addMaterial() {
    if (!materialDraft.name.trim() || !materialDraft.code.trim()) return;
    const factoryPrice = Number(materialDraft.factory_price_rmb) || 0;
    const weight = Number(materialDraft.weight) || 1;
    const usdCost = Number(materialDraft.usd_cost) || calcUsdCost(factoryPrice, weight);
    const salePrice = Number(materialDraft.sale_price_usd) || 0;
    const matchedSupplier = findSupplierByReference(suppliers, { supplierName: materialDraft.supplier });
    const vipPrice = Number(materialDraft.vip_sale_price_usd) || 0;
    const nextItem = { id: editingMaterialId || nextSequentialId(materials.map((item) => item.id), "MAT"), code: materialDraft.code.trim(), name: materialDraft.name.trim(), specification: materialDraft.specification || undefined, size: materialDraft.size || undefined, unit: materialDraft.unit, stock_quantity: Number(materialDraft.stock_quantity) || 0, min_stock: 0, factory_price_rmb: factoryPrice, usd_cost: usdCost, sale_price_usd: salePrice, vip_sale_price_usd: vipPrice || undefined, weight, purchase_price: usdCost, supplier: materialDraft.supplier || undefined, supplier_id: matchedSupplier?.id, image: materialDraft.image || undefined, last_stock_date: today, remark: materialDraft.remark || undefined, color: materialDraft.color || undefined, material: materialDraft.material || undefined, other: materialDraft.other || undefined, category: materialDraft.category || undefined } satisfies MaterialRecord;
    if (editingMaterialId) {
      setMaterials((prev) => prev.map((item) => item.id === editingMaterialId ? nextItem : item));
      setInventoryHint(`已更新物料 ${nextItem.name}${matchedSupplier ? ",已绑定供应商" : ",但供应商名称未唯一匹配"}。`);
    } else {
      setMaterials((prev) => [nextItem, ...prev]);
      setInventoryHint(`已新增物料 ${nextItem.name}${matchedSupplier ? ",已绑定供应商" : ",但供应商名称未唯一匹配"}。`);
    }
    resetMaterialDraft();
    setShowMaterialModal(false);
    onAutoSave?.();
  }

  function openEditMaterial(item: MaterialRecord) {
    setEditingMaterialId(item.id);
    setMaterialDraft({ code: item.code, name: item.name, specification: item.specification ?? "", size: item.size ?? "", unit: item.unit, stock_quantity: String(item.stock_quantity ?? 0), factory_price_rmb: String(item.factory_price_rmb ?? 0), weight: String(item.weight ?? 1), usd_cost: String(item.usd_cost ?? calcUsdCost(item.factory_price_rmb ?? 0, item.weight)), sale_price_usd: String(item.sale_price_usd ?? 0), vip_sale_price_usd: String(item.vip_sale_price_usd ?? ""), supplier: item.supplier ?? suppliers[0]?.name ?? "", image: item.image ?? "", remark: item.remark ?? "", color: item.color ?? "", material: item.material ?? "", other: item.other ?? "", category: item.category ?? "" });
    setShowMaterialModal(true);
  }

  function deleteMaterial(id: string) {
    setMaterials((prev) => prev.filter((item) => item.id !== id));
    setConfirmingMaterialId(null);
    onAutoSave?.();
  }

  return (
    <div>
      <SectionHeader eyebrow="Materials & Inventory" title="物料库存" actions={sub === "inventory" ? <ActionBtn tone="primary" onClick={() => { resetMaterialDraft(); setShowMaterialModal(true); }}>+ 新建物料</ActionBtn> : undefined} />
      <StatStrip items={[{ label: "物料品类", value: String(materials.length) }, { label: "总库存", value: String(materials.reduce((sum, item) => sum + item.stock_quantity, 0)) }, { label: "批发订单数", value: String(orders.filter((item) => item.order_type === "批发单" && item.status !== "已关闭").length), accent: "text-sky-600" }]} />

      {inventoryHint ? <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">{inventoryHint}</div> : null}

      {/* Filter Bar — single row */}
      <div className="mb-4 flex flex-nowrap items-center gap-2">
        <div className="min-w-[80px] flex-1"><SmallInput value={nameFilter} onChange={(v) => setNameFilter(v)} placeholder="搜索物料名称..." /></div>
        <div className="w-[120px]"><SmallSelect value={categoryFilter} onChange={(v) => setCategoryFilter(v)} options={["", ...materialCategoryOptions.filter(Boolean)]} labels={{ "": "全部" }} /></div>
        <div className="w-[150px]"><SmallSelect value={supplierFilter} onChange={(v) => setSupplierFilter(v)} options={["", ...distinctSuppliers]} labels={{ "": "全部供应商" }} /></div>
        <div className="w-[130px]"><SmallSelect value={monthFilter} onChange={(v) => setMonthFilter(v)} options={["", ...distinctMonths]} labels={{ "": "全部月份" }} /></div>
      </div>

      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-700">{editingMaterialId ? "编辑物料" : "新建物料"}</h3>
                <p className="mt-1 text-xs text-slate-700">支持尺寸、单重、图片、出厂价、美金成本和卖出价。</p>
              </div>
              <button onClick={() => setShowMaterialModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">物料编码</p><SmallInput value={materialDraft.code} onChange={(v) => setMaterialDraft((d) => ({ ...d, code: v }))} placeholder="例如 FAB-BLK-280" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">物料名称</p><SmallInput value={materialDraft.name} onChange={(v) => setMaterialDraft((d) => ({ ...d, name: v }))} placeholder="例如 遮光布" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">规格</p><SmallInput value={materialDraft.specification} onChange={(v) => setMaterialDraft((d) => ({ ...d, specification: v }))} placeholder="例如 宽280cm,米白色" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">尺寸</p><SmallInput value={materialDraft.size} onChange={(v) => setMaterialDraft((d) => ({ ...d, size: v }))} placeholder="例如 280cm" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">总库存</p><SmallInput value={materialDraft.stock_quantity} onChange={(v) => setMaterialDraft((d) => ({ ...d, stock_quantity: v }))} type="number" placeholder="当前库存数量" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">出厂价 RMB</p><SmallInput value={materialDraft.factory_price_rmb} onChange={(v) => syncMaterialCosts(v, materialDraft.weight)} type="number" placeholder="人民币出厂价" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">单重</p><SmallInput value={materialDraft.weight} onChange={(v) => syncMaterialCosts(materialDraft.factory_price_rmb, v)} type="number" placeholder="默认 1" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">美金成本 USD</p><SmallInput value={materialDraft.usd_cost} onChange={(v) => setMaterialDraft((d) => ({ ...d, usd_cost: v }))} type="number" placeholder="自动可改" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">卖出价 USD</p><SmallInput value={materialDraft.sale_price_usd} onChange={(v) => setMaterialDraft((d) => ({ ...d, sale_price_usd: v }))} type="number" placeholder="普通卖价" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">VIP 卖出价 USD</p><SmallInput value={materialDraft.vip_sale_price_usd} onChange={(v) => setMaterialDraft((d) => ({ ...d, vip_sale_price_usd: v }))} type="number" placeholder="留空 = 普通价" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">单位</p><SmallSelect value={materialDraft.unit} onChange={(v) => setMaterialDraft((d) => ({ ...d, unit: v }))} options={["个", "米", "根", "套", "张"]} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">供应商</p><SmallSelect value={materialDraft.supplier} onChange={(v) => setMaterialDraft((d) => ({ ...d, supplier: v }))} options={suppliers.length ? suppliers.map((item) => item.name) : ["未指定"]} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">分类</p><SmallSelect value={materialDraft.category} onChange={(v) => setMaterialDraft((d) => ({ ...d, category: v }))} options={materialCategoryOptions} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">颜色</p><SmallInput value={materialDraft.color} onChange={(v) => setMaterialDraft((d) => ({ ...d, color: v }))} placeholder="例如 米白色" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">材料</p><SmallInput value={materialDraft.material} onChange={(v) => setMaterialDraft((d) => ({ ...d, material: v }))} placeholder="例如 涤纶 / 棉麻" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">其他</p><SmallInput value={materialDraft.other} onChange={(v) => setMaterialDraft((d) => ({ ...d, other: v }))} placeholder="其他备注信息" /></div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <div><p className="mb-1 text-[11px] font-semibold text-slate-700">备注说明</p><SmallInput value={materialDraft.remark} onChange={(v) => setMaterialDraft((d) => ({ ...d, remark: v }))} placeholder="例如 主力布料 / 常用颜色 / 特殊说明" /></div>
                <label className="block rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">上传图片</span>
                  <p className="mt-1 text-[11px] text-slate-700">支持上传物料实拍图,方便后面辨认。</p>
                  <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => handleMaterialImageUpload(e.target.files?.[0])} />
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">图片预览</p>
                {materialDraft.image ? <img src={imgUrl(materialDraft.image)} alt="物料图片" className="mt-2 h-32 w-full rounded-lg object-cover" /> : <div className="mt-2 flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-700">暂无图片</div>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowMaterialModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={addMaterial}>{editingMaterialId ? "确认保存" : "确认新建"}</ActionBtn>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Card Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pagedInventoryRows.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
              <div className="aspect-square w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                {item.image ? (
                  <img src={imgUrl(item.image)} alt={item.name} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-700">暂无图片</div>
                )}
              </div>
              <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                <p className="text-xs font-semibold text-slate-700 leading-tight line-clamp-2">{item.name}</p>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  {item.specification ? <p className="truncate">规格：{item.specification}</p> : null}
                  {item.size ? <p className="truncate">尺寸：{item.size}</p> : null}
                  <p>库存：<span className="font-semibold text-slate-700">{item.stock_quantity}</span></p>
                  <p>卖出价：<span className="font-semibold text-slate-700">${item.sale_price_usd ?? 0}</span></p>
                  {item.vip_sale_price_usd ? <p>VIP价：<span className="font-semibold text-amber-600">${item.vip_sale_price_usd}</span></p> : null}
                </div>
                <div className="mt-auto pt-2 flex gap-2">
                  <button onClick={() => openEditMaterial(item)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors text-center">编辑</button>
                  {confirmingMaterialId === item.id ? (
                    <>
                      <button onClick={() => deleteMaterial(item.id)} className="flex-1 rounded-lg border border-red-400 bg-red-500 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-red-600 transition-colors text-center">确认</button>
                      <button onClick={() => setConfirmingMaterialId(null)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-700 hover:border-slate-300 transition-colors text-center">取消</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmingMaterialId(item.id)} className="flex-1 rounded-lg border border-rose-100 px-2 py-1.5 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors text-center">删除</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {pagedInventoryRows.length === 0 ? (
            <div className="col-span-full py-12 text-center text-xs text-slate-700">暂无物料{nameFilter || categoryFilter || supplierFilter || monthFilter ? "，匹配当前筛选条件" : ""}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-600"><span>第 {inventoryPage} / {inventoryPageCount} 页,共 {inventoryRows.length} 条物料</span><div className="flex items-center gap-2"><button type="button" onClick={() => setInventoryPage((p) => Math.max(1, p - 1))} disabled={inventoryPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setInventoryPage((p) => Math.min(inventoryPageCount, p + 1))} disabled={inventoryPage >= inventoryPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
      </div>
    </div>
  );
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
  return formatLocalDate(date);
}

function getRangeDates(start: string, end: string) {
  const result: string[] = [];
  const cursor = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  while (cursor <= endDate) {
    result.push(formatLocalDate(cursor));
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
      const leaveMinutes = 0;
      const record: AttendanceRecord = {
        id: `ATT-${date.replaceAll("-", "")}-${employee.code || employee.id}`,
        date,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_code: employee.code,
        leave_minutes: leaveMinutes,
        overtime_minutes: 0,
        worked_minutes: defaultMinutes,
        meal_allowance: defaultMinutes > 300 && leaveMinutes < 300 && Boolean(employee.meal_allowance_eligible),
        generated_by: `auto-rule:${settings.auto_attendance_timezone || "America/New_York"}:${settings.auto_attendance_run_time || "01:00"}`,
        note: settings.auto_attendance_note || undefined,
      };
      existingMap.set(key, record);
      next.push(record);
    });
  });

  return next.map((item) => {
    if (item.note === "__deleted__") return item;
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
      meal_allowance: leaveMinutes >= 300 ? false : (workedMinutes > 300 ? Boolean(item.meal_allowance && employee?.meal_allowance_eligible !== false) : false),
    };
  });
}

function EmployeesSection({ employees, setEmployees, attendances, setAttendances, payrolls, setPayrolls, expenses, setExpenses, settings, setSettings, onAutoSave }: { employees: EmployeeRecord[]; setEmployees: React.Dispatch<React.SetStateAction<EmployeeRecord[]>>; attendances: AttendanceRecord[]; setAttendances: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>; payrolls: PayrollRecord[]; setPayrolls: React.Dispatch<React.SetStateAction<PayrollRecord[]>>; expenses: ExpenseRecord[]; setExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>; settings: BizSettings; setSettings: React.Dispatch<React.SetStateAction<BizSettings>>; onAutoSave?: () => void; }) {
  const [sub, setSub] = useState<StaffSub>("profiles");
  const [profileEthnicityFilter, setProfileEthnicityFilter] = useState("全部");
  const [profileSearch, setProfileSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("today");
  const [attendanceEthnicityFilter, setAttendanceEthnicityFilter] = useState("全部");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const [profilePage, setProfilePage] = useState(1);
  const [payrollPage, setPayrollPage] = useState(1);
  const [payrollWeekFilter, setPayrollWeekFilter] = useState<PayrollWeekFilter>("lastWeek");
  const [payrollEthnicityFilter, setPayrollEthnicityFilter] = useState("全部");
  const [payrollSearch, setPayrollSearch] = useState("");
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const [confirmingAttendanceId, setConfirmingAttendanceId] = useState<string | null>(null);
  const [attendanceDraftError, setAttendanceDraftError] = useState("");
  const [showQuickPunchModal, setShowQuickPunchModal] = useState(false);
  const [quickPunchEmployeeId, setQuickPunchEmployeeId] = useState("");
  const [quickPunchError, setQuickPunchError] = useState("");
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
        hourly_rate: item.hourly_rate ?? 10,
        workdays: item.workdays?.length ? item.workdays : ["Mon", "Tue", "Wed", "Thu", "Fri"],
        meal_allowance_eligible: item.meal_allowance_eligible ?? true,
      };
    });
  }, [employees]);
  const seededAttendances = useMemo(() => ensureAttendanceRows(normalizedEmployees, attendances, attendanceRange, settings), [normalizedEmployees, attendances, attendanceRange, settings]);
  const mealAllowanceAmount = settings.meal_allowance_amount ?? 15;

  useEffect(() => {
    if (seededAttendances.length !== attendances.length) setAttendances(seededAttendances);
  }, [seededAttendances, attendances.length, setAttendances]);

  const profileRows = useMemo(() => {
    const keyword = profileSearch.trim().toLowerCase();
    return normalizedEmployees
      .filter((item) => item.status === "在职")
      .filter((item) => profileEthnicityFilter === "全部" || item.ethnicity === profileEthnicityFilter)
      .filter((item) => {
        if (!keyword) return true;
        return [item.code, item.name, item.phone, item.ethnicity, String(item.hourly_rate ?? "")]
          .some((value) => String(value || "").toLowerCase().includes(keyword));
      })
      .sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
  }, [normalizedEmployees, profileEthnicityFilter, profileSearch]);
  const profilePageSize = 10;
  const profilePageCount = Math.max(1, Math.ceil(profileRows.length / profilePageSize));
  const pagedProfileRows = profileRows.slice((profilePage - 1) * profilePageSize, profilePage * profilePageSize);
  useEffect(() => { setProfilePage(1); }, [profileRows]);

  const attendanceRows = useMemo(() => seededAttendances
    .filter((item) => item.note !== "__deleted__")
    .filter((item) => item.date >= attendanceRange.start && item.date <= attendanceRange.end)
    .filter((item) => {
      if (attendanceEthnicityFilter === "全部") return true;
      const employee = normalizedEmployees.find((row) => row.id === item.employee_id || row.name === item.employee_name);
      return employee?.ethnicity === attendanceEthnicityFilter;
    })
    .filter((item) => {
      if (!attendanceSearch.trim()) return true;
      const kw = attendanceSearch.trim().toLowerCase();
      return [item.employee_name, item.employee_code, normalizedEmployees.find((row) => row.id === item.employee_id || row.name === item.employee_name)?.name]
        .some((v) => String(v || "").toLowerCase().includes(kw));
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.employee_code || a.employee_name).localeCompare(String(b.employee_code || b.employee_name))), [seededAttendances, attendanceRange, attendanceEthnicityFilter, normalizedEmployees]);
  const attendancePageSize = 10;
  const attendancePageCount = Math.max(1, Math.ceil(attendanceRows.length / attendancePageSize));
  const pagedAttendanceRows = useMemo(() => attendanceRows.slice((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize), [attendanceRows, attendancePage]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceFilter, attendanceEthnicityFilter]);

  useEffect(() => {
    setAttendancePage((page) => Math.min(page, attendancePageCount));
  }, [attendancePageCount]);

  const payrollRows = useMemo(() => normalizedEmployees
    .filter((employee) => employee.status === "在职")
    .filter((employee) => payrollEthnicityFilter === "全部" || employee.ethnicity === payrollEthnicityFilter)
    .filter((employee) => {
      if (!payrollSearch.trim()) return true;
      const kw = payrollSearch.trim().toLowerCase();
      return [employee.name, employee.code, String(employee.phone || "")].some((v) => v.toLowerCase().includes(kw));
    })
    .map((employee) => {
      const rows = attendances
        .filter((item) => item.note !== "__deleted__" && (item.employee_id === employee.id || item.employee_name === employee.name) && item.date >= payrollRange.start && item.date <= payrollRange.end)
        .map((item) => {
          const leaveMinutes = Math.max(0, Math.round(item.leave_minutes || 0));
          const overtimeMinutes = Math.max(0, Math.round(item.overtime_minutes || 0));
          const workedMinutes = calcWorkedMinutes(leaveMinutes, overtimeMinutes);
          return {
            ...item,
            leave_minutes: leaveMinutes,
            overtime_minutes: overtimeMinutes,
            worked_minutes: workedMinutes,
            meal_allowance: workedMinutes > 300 && leaveMinutes < 300 ? Boolean(item.meal_allowance && employee.meal_allowance_eligible !== false) : false,
          };
        });
      const totalMinutes = rows.reduce((sum, item) => sum + item.worked_minutes, 0);
      const mealCount = rows.filter((item) => item.meal_allowance).length;
      const hourlyRate = employee.hourly_rate || 0;
      const wage = Number((minutesToHours(totalMinutes) * hourlyRate + mealCount * mealAllowanceAmount).toFixed(2));
      const payrollId = `PAY-${payrollRange.start}-${employee.id}`;
      const existing = payrolls.find((item) => item.id === payrollId);
      const linkedExpense = existing?.expense_id
        ? expenses.find((item) => item.id === existing.expense_id)
        : expenses.find((item) => item.expense_type === "工资"
            && item.target === employee.name
            && item.remark === `${payrollRange.start} ~ ${payrollRange.end}`);
      return {
        employee,
        totalMinutes,
        mealCount,
        hourlyRate,
        wage,
        payrollId,
        paid: existing?.payment_status === "已发放" && Boolean(linkedExpense),
      };
    }), [normalizedEmployees, attendances, payrollRange, payrolls, payrollEthnicityFilter, mealAllowanceAmount, expenses]);
  const payrollPageSize = 10;
  const payrollPageCount = Math.max(1, Math.ceil(payrollRows.length / payrollPageSize));
  const pagedPayrollRows = payrollRows.slice((payrollPage - 1) * payrollPageSize, payrollPage * payrollPageSize);
  useEffect(() => { setPayrollPage(1); }, [payrollRows]);

  const [employeeDraft, setEmployeeDraft] = useState({ name: "", phone: "", hourly_rate: "", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"], meal_allowance_eligible: true, ethnicity: "华人" });
  const [attendanceDraft, setAttendanceDraft] = useState({ employee_id: "", date: today, leave_minutes: "0", overtime_minutes: "0" });

  function openCreateEmployee() {
    setEditingEmployeeId(null);
    setEmployeeDraft({ name: "", phone: "", hourly_rate: "", workdays: ["Mon", "Tue", "Wed", "Thu", "Fri"], meal_allowance_eligible: true, ethnicity: "华人" });
    setShowEmployeeModal(true);
  }

  function openEditEmployee(employee: EmployeeRecord) {
    setEditingEmployeeId(employee.id);
    setEmployeeDraft({
      name: employee.name,
      phone: employee.phone || "",
      hourly_rate: String(employee.hourly_rate ?? 10),
      workdays: employee.workdays?.length ? employee.workdays : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      meal_allowance_eligible: employee.meal_allowance_eligible ?? true,
      ethnicity: employee.ethnicity || "华人",
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
      position: undefined,
      phone: employeeDraft.phone || undefined,
      monthly_salary: current?.monthly_salary ?? 0,
      hourly_rate: Number(employeeDraft.hourly_rate) || 10,
      workdays: employeeDraft.workdays,
      meal_allowance_eligible: employeeDraft.meal_allowance_eligible,
      ethnicity: employeeDraft.ethnicity,
      status: "在职",
    };
    delete payload.hire_date;
    delete payload.contract_end;
    setEmployees((prev) => editingEmployeeId ? prev.map((item) => item.id === editingEmployeeId ? payload : item) : [payload, ...prev]);
    // Cascade employee rename to attendance and payroll records
    if (editingEmployeeId && current && current.name !== payload.name) {
      setAttendances((prev) => prev.map((r) => r.employee_id === editingEmployeeId ? { ...r, employee_name: payload.name } : r));
      setPayrolls((prev) => prev.map((r) => r.employee_id === editingEmployeeId ? { ...r, employee_name: payload.name } : r));
    }
    setShowEmployeeModal(false);
    onAutoSave?.();
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
        meal_allowance: (workedMinutes > 300 && leaveMinutes < 300) ? (employee?.meal_allowance_eligible ? manualMeal : false) : false,
      };
    }));
  }

  function saveAttendanceDraft() {
    const employee = normalizedEmployees.find((item) => item.id === attendanceDraft.employee_id) || normalizedEmployees[0];
    if (!employee) return;
    const duplicateExists = attendances.some((item) => item.note !== "__deleted__" && item.date === attendanceDraft.date && (item.employee_id === employee.id || item.employee_name === employee.name));
    if (duplicateExists) {
      setAttendanceDraftError(`{employee.name} 在 ${attendanceDraft.date} 已有考勤,不能重复新增,请直接编辑原记录。`.replace("{employee.name}", employee.name));
      return;
    }
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
      meal_allowance: workedMinutes > 300 && leaveMinutes < 300 && Boolean(employee.meal_allowance_eligible),
      generated_by: "manual",
      note: "手工补录",
    };
    setAttendances((prev) => [nextRecord, ...prev]);
    setAttendanceDraftError("");
    setAttendanceDraft({ employee_id: normalizedEmployees[0]?.id || "", date: today, leave_minutes: "0", overtime_minutes: "0" });
    setShowAttendanceModal(false);
    onAutoSave?.();
  }

  function quickPunchIn() {
    const employee = normalizedEmployees.find((item) => item.id === quickPunchEmployeeId) || normalizedEmployees[0];
    if (!employee) return;
    const duplicateExists = attendances.some((item) => item.note !== "__deleted__" && item.date === today && (item.employee_id === employee.id || item.employee_name === employee.name));
    if (duplicateExists) {
      setQuickPunchError(`${employee.name} 今日已有考勤记录,无需重复签到。`);
      return;
    }
    const workedMinutes = 600;
    const nextRecord: AttendanceRecord = {
      id: `ATT-${today.replaceAll("-", "")}-${employee.code || employee.id}`,
      date: today,
      employee_id: employee.id,
      employee_name: employee.name,
      employee_code: employee.code,
      leave_minutes: 0,
      overtime_minutes: 0,
      worked_minutes: workedMinutes,
      meal_allowance: workedMinutes > 300 && Boolean(employee.meal_allowance_eligible),
      generated_by: "manual",
      note: "一键签到",
    };
    setAttendances((prev) => [nextRecord, ...prev]);
    setShowQuickPunchModal(false);
    setQuickPunchError("");
    onAutoSave?.();
  }

  function deleteAttendance(id: string) {
    setAttendances((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      return item.generated_by?.startsWith("auto-rule:")
        ? { ...item, note: "__deleted__", meal_allowance: false }
        : item;
    }).filter((item) => item.id !== id || item.generated_by?.startsWith("auto-rule:")));
    setEditingAttendanceId((current) => current === id ? null : current);
    setConfirmingAttendanceId(null);
    onAutoSave?.();
  }

  function markAllVisiblePaid() {
    const visible = payrollRows.filter((item) => !item.paid && item.wage > 0);
    if (!visible.length) return;
    const paidAt = todayIso();
    const expenseIds = visible.map((_, index) => nextYearScopedId(expenses.map((item) => item.id), "EXP", new Date().getFullYear(), 3, index + 1));
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
        meal_allowance_total: row.mealCount * mealAllowanceAmount,
        base_salary: row.wage,
        bonus: 0,
        deduction: 0,
        net_salary: row.wage,
        payment_status: "已发放",
        paid_at: paidAt,
        expense_id: expenseIds[index],
      } satisfies PayrollRecord));
      return [...next, ...rest];
    });
    setExpenses((prev) => [
      ...visible.map((row, index) => ({
        id: expenseIds[index],
        target: row.employee.name,
        detail: `${payrollRange.label}工资发放`,
        amount: row.wage,
        expense_type: "工资",
        payment_method: "转账",
        expense_date: paidAt,
        remark: `${payrollRange.start} ~ ${payrollRange.end}`,
        source_type: "payroll",
        source_id: row.payrollId,
      } satisfies ExpenseRecord)),
      ...prev,
    ]);
    onAutoSave?.();
  }

  const ruleRows = [
    { label: "饭补金额", value: formatMoney(settings.meal_allowance_amount || 0) },
    { label: "自动考勤时区", value: settings.auto_attendance_timezone || "America/New_York" },
    { label: "自动执行时间", value: settings.auto_attendance_run_time || "01:00" },
    { label: "自动默认工时", value: formatMinutes(settings.auto_attendance_default_minutes || 600) },
    { label: "自动规则说明", value: `在职员工按工作日自动生成 10 小时考勤,再叠加请假 / 加班修正。` },
  ];

  const configs: Record<StaffSub, TabularSchemaConfig> = {
    profiles: {
      title: "员工档案",
      filePrefix: "biz-employees",
      columns: ["工号", "姓名", "电话", "时薪", "工作日", "饭补资格", "分组"],
      exportRows: () => profileRows.map((item) => [item.code || "", item.name, item.phone || "", item.hourly_rate || 0, (item.workdays || []).join("/"), item.meal_allowance_eligible ? "是" : "否", item.ethnicity]),
      printRows: () => profileRows.map((item) => [item.code || "-", item.name, item.phone || "-", formatMoney(item.hourly_rate || 0), (item.workdays || []).map((day) => WORKDAY_OPTIONS.find((option) => option.key === day)?.label || day).join("、"), item.meal_allowance_eligible ? "可用" : "关闭", item.ethnicity]),
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

  return (
    <div>
      <SectionHeader
        eyebrow="Human Resources"
        title="员工管理"
        actions={
          <>
            {sub === "profiles" ? <ActionBtn tone="primary" onClick={openCreateEmployee}>+ 新建员工</ActionBtn> : null}            {sub === "attendance" ? <ActionBtn tone="primary" onClick={() => { setAttendanceDraft({ employee_id: normalizedEmployees[0]?.id || "", date: today, leave_minutes: "0", overtime_minutes: "0" }); setAttendanceDraftError(""); setShowAttendanceModal(true); }}>+ 手工补录</ActionBtn> : null}            {sub === "attendance" ? <ActionBtn onClick={() => { setQuickPunchEmployeeId(normalizedEmployees[0]?.id || ""); setQuickPunchError(""); setShowQuickPunchModal(true); }}>一键签到</ActionBtn> : null}
            {sub === "payroll" ? <ActionBtn tone="success" onClick={markAllVisiblePaid}>一键发放当前工资</ActionBtn> : null}
          </>
        }
      />
      <StatStrip items={[{ label: "在职员工", value: String(normalizedEmployees.filter((item) => item.status === "在职").length) }, { label: "当前考勤", value: String(attendanceRows.length), accent: "text-slate-700" }, { label: "当前工资", value: formatMoney(payrollRows.reduce((sum, item) => sum + item.wage, 0)), accent: "text-orange-600" }, { label: "已发放", value: formatMoney(payrollRows.filter((item) => item.paid).reduce((sum, item) => sum + item.wage, 0)), accent: "text-green-600" }]} />
      <SegmentedControl options={[{ key: "profiles", label: "员工档案" }, { key: "attendance", label: "考勤" }, { key: "payroll", label: "工资" }, { key: "rules", label: "员工系统规则" }]} value={sub} onChange={setSub} />

      {sub === "profiles" ? (
        <div className="space-y-4">
          <PanelCard title="员工档案" note="员工工号自动递增,员工档案单独管理,不再和考勤或规则混在一起。">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[180px] flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs">⌕</span><input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="筛选员工 / 工号 / 电话 / 分组" className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><span className="text-xs text-slate-700">员工分组</span><select value={profileEthnicityFilter} onChange={(e) => setProfileEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><div className="text-xs text-slate-700">共 {profileRows.length} 名员工</div></div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50"><table className="w-full text-left text-xs"><thead><tr className="border-b border-gray-200 bg-gray-50"><th className="px-4 py-2 font-semibold text-slate-600">工号</th><th className="px-4 py-2 font-semibold text-slate-600">姓名</th><th className="px-4 py-2 font-semibold text-slate-600">电话</th><th className="px-4 py-2 font-semibold text-slate-600">时薪</th><th className="px-4 py-2 font-semibold text-slate-600">工作日</th><th className="px-4 py-2 font-semibold text-slate-600">饭补资格</th><th className="px-4 py-2 font-semibold text-slate-600">分组</th><th className="px-4 py-2 font-semibold text-slate-600">操作</th></tr></thead><tbody>{pagedProfileRows.map((item) => <tr key={item.id} className="border-b border-gray-200 last:border-b-0"><td className="px-4 py-2 font-medium text-slate-700">{item.code}</td><td className="px-4 py-2 text-slate-700">{item.name}</td><td className="px-4 py-2 text-slate-600">{item.phone || "-"}</td><td className="px-4 py-2 text-slate-700">{formatMoney(item.hourly_rate || 0)}</td><td className="px-4 py-2 text-slate-600">{(item.workdays || []).map((day) => WORKDAY_OPTIONS.find((option) => option.key === day)?.label || day).join("、")}</td><td className="px-4 py-2 text-slate-600">{item.meal_allowance_eligible ? "可用" : "关闭"}</td><td className="px-4 py-2 text-slate-600">{item.ethnicity}</td><td className="px-4 py-2"><ActionBtn onClick={() => openEditEmployee(item)}>编辑</ActionBtn></td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-600"><span>第 {profilePage} / {profilePageCount} 页,共 {profileRows.length} 名员工</span><div className="flex items-center gap-2"><button type="button" onClick={() => setProfilePage((p) => Math.max(1, p - 1))} disabled={profilePage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setProfilePage((p) => Math.min(profilePageCount, p + 1))} disabled={profilePage >= profilePageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
          </PanelCard>
        </div>
      ) : null}

      {sub === "attendance" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><SegmentedControl options={[{ key: "today", label: "今天" }, { key: "thisWeek", label: "本周" }, { key: "lastWeek", label: "上周" }]} value={attendanceFilter} onChange={setAttendanceFilter} /><div className="relative min-w-[140px]"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs">⌕</span><input value={attendanceSearch} onChange={(e) => setAttendanceSearch(e.target.value)} placeholder="搜索员工" className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><div className="flex items-center gap-2"><span className="text-xs text-slate-700">分组</span><select value={attendanceEthnicityFilter} onChange={(e) => setAttendanceEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><span className="text-xs text-slate-700">{attendanceRange.start} ~ {attendanceRange.end}</span></div>
          <PanelCard title="考勤规则说明" note="当天工作时长 = 10小时 + 加班时长 - 请假时长。工时小于等于 5 小时时强制取消饭补。"><div className="text-xs text-slate-700">缺失考勤会按员工工作日和自动规则补齐,支持逐行人工修正。当前饭补金额 {formatMoney(mealAllowanceAmount)} / 次。</div></PanelCard>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50"><table className="w-full text-left text-xs"><thead><tr className="border-b border-gray-200 bg-gray-50"><th className="px-3 py-2 font-semibold text-slate-600">日期</th><th className="px-3 py-2 font-semibold text-slate-600">工号</th><th className="px-3 py-2 font-semibold text-slate-600">人名</th><th className="px-3 py-2 font-semibold text-slate-600">工作时长</th><th className="px-3 py-2 font-semibold text-slate-600">请假时长</th><th className="px-3 py-2 font-semibold text-slate-600">加班时长</th><th className="px-3 py-2 font-semibold text-slate-600">饭补</th><th className="px-3 py-2 font-semibold text-slate-600">操作</th></tr></thead><tbody>{pagedAttendanceRows.map((item) => { const employee = normalizedEmployees.find((row) => row.id === item.employee_id || row.name === item.employee_name); const editing = editingAttendanceId === item.id; return <tr key={item.id} className="border-b border-gray-200 last:border-b-0"><td className="px-3 py-2 text-slate-600">{item.date}</td><td className="px-3 py-2 text-slate-700">{item.employee_code || employee?.code || "-"}</td><td className="px-3 py-2 font-medium text-slate-700">{item.employee_name}</td><td className="px-3 py-2 text-slate-700">{formatMinutes(item.worked_minutes)}</td>{editing ? <><td className="px-3 py-2"><SmallInput value={String(item.leave_minutes)} onChange={(v) => setAttendanceField(item.id, "leave_minutes", Number(v) || 0)} type="number" /></td><td className="px-3 py-2"><SmallInput value={String(item.overtime_minutes)} onChange={(v) => setAttendanceField(item.id, "overtime_minutes", Number(v) || 0)} type="number" /></td><td className="px-3 py-2"><label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={item.meal_allowance} disabled={item.worked_minutes <= 300 || !employee?.meal_allowance_eligible} onChange={(e) => setAttendanceField(item.id, "meal_allowance", e.target.checked)} /> 饭补</label></td><td className="px-3 py-2"><div className="flex gap-2"><ActionBtn tone="success" onClick={() => setEditingAttendanceId(null)}>完成</ActionBtn><ActionBtn onClick={() => setEditingAttendanceId(null)}>取消</ActionBtn></div></td></> : <><td className="px-3 py-2 text-slate-600">{formatMinutes(item.leave_minutes)}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(item.overtime_minutes)}</td><td className="px-3 py-2 text-slate-600">{item.meal_allowance ? `是 · 当前饭补金额 ${formatMoney(mealAllowanceAmount)} / 次` : "否"}</td><td className="px-3 py-2"><div className="flex gap-2">{confirmingAttendanceId === item.id ? <><button onClick={() => deleteAttendance(item.id)} className="rounded border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-red-600 transition-colors">确认</button><button onClick={() => setConfirmingAttendanceId(null)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300 transition-colors">取消</button></> : <><ActionBtn onClick={() => setEditingAttendanceId(item.id)}>编辑</ActionBtn><button onClick={() => setConfirmingAttendanceId(item.id)} className="rounded border border-rose-100 px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 hover:bg-rose-50 transition-colors">删除</button></>}</div></td></>}</tr>; })}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-600"><span>第 {attendancePage} / {attendancePageCount} 页,共 {attendanceRows.length} 条考勤</span><div className="flex items-center gap-2"><button type="button" onClick={() => setAttendancePage((page) => Math.max(1, page - 1))} disabled={attendancePage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setAttendancePage((page) => Math.min(attendancePageCount, page + 1))} disabled={attendancePage >= attendancePageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
        </div>
      ) : null}

      {sub === "payroll" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><SegmentedControl options={[{ key: "lastWeek", label: "上周" }, { key: "thisWeek", label: "本周" }]} value={payrollWeekFilter} onChange={setPayrollWeekFilter} /><div className="relative min-w-[140px]"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs">⌕</span><input value={payrollSearch} onChange={(e) => setPayrollSearch(e.target.value)} placeholder="搜索员工" className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" /></div><div className="flex items-center gap-2"><span className="text-xs text-slate-700">分组</span><select value={payrollEthnicityFilter} onChange={(e) => setPayrollEthnicityFilter(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"><option>全部</option>{EMPLOYEE_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div><span className="text-xs text-slate-700">{payrollRange.start} ~ {payrollRange.end}</span></div>
          <PanelCard title="工资说明" note={`工资 = 总工时 × 时薪 + 饭补次数 × 当前饭补金额。点击一键发放后,会自动落一笔"工资"支出。`}><div className="text-xs text-slate-700">当前饭补金额 {formatMoney(mealAllowanceAmount)} / 次,保留周维度发放,本周 / 上周两档。</div></PanelCard>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50"><table className="w-full text-left text-xs"><thead><tr className="border-b border-gray-200 bg-gray-50"><th className="px-4 py-2 font-semibold text-slate-600">姓名</th><th className="px-4 py-2 font-semibold text-slate-600">时薪</th><th className="px-4 py-2 font-semibold text-slate-600">总工时</th><th className="px-4 py-2 font-semibold text-slate-600">饭补说明</th><th className="px-4 py-2 font-semibold text-slate-600">应发工资</th><th className="px-4 py-2 font-semibold text-slate-600">是否已发放工资</th></tr></thead><tbody>{pagedPayrollRows.map((item) => <tr key={item.employee.id} className="border-b border-gray-200 last:border-b-0"><td className="px-4 py-2 font-medium text-slate-700">{item.employee.name}</td><td className="px-4 py-2 text-slate-700">{formatMoney(item.hourlyRate)}</td><td className="px-4 py-2 text-slate-600">{formatMinutes(item.totalMinutes)}</td><td className="px-4 py-2 text-slate-600">{item.mealCount > 0 ? `${item.mealCount} 次,当前饭补金额 ${formatMoney(mealAllowanceAmount)} / 次` : "无"}</td><td className="px-4 py-2 font-semibold text-slate-700">{formatMoney(item.wage)}</td><td className="px-4 py-2 text-slate-600">{item.paid ? "已发放" : "未发放"}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-600"><span>第 {payrollPage} / {payrollPageCount} 页,共 {payrollRows.length} 条工资</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPayrollPage((p) => Math.max(1, p - 1))} disabled={payrollPage <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">上一页</button><button type="button" onClick={() => setPayrollPage((p) => Math.min(payrollPageCount, p + 1))} disabled={payrollPage >= payrollPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">下一页</button></div></div>
        </div>
      ) : null}

      {sub === "rules" ? (
        <div className="space-y-4">
          <PanelCard title="员工系统规则" note="修改后自动保存,无需手动操作。">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">执行时间</p><SmallInput value={settings.auto_attendance_run_time ?? "01:00"} onChange={(v) => { setSettings((prev) => ({ ...prev, auto_attendance_run_time: v })); setTimeout(() => onAutoSave?.(), 0); }} /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">自动默认工时(分钟)</p><SmallInput value={String(settings.auto_attendance_default_minutes ?? 600)} onChange={(v) => { setSettings((prev) => ({ ...prev, auto_attendance_default_minutes: Number(v) || 0 })); setTimeout(() => onAutoSave?.(), 0); }} type="number" /></div>
              <div><p className="mb-1 text-[11px] font-semibold text-slate-700">每餐餐补金额</p><SmallInput value={String(settings.meal_allowance_amount ?? "")} onChange={(v) => { setSettings((prev) => ({ ...prev, meal_allowance_amount: Number(v) || 0 })); setTimeout(() => onAutoSave?.(), 0); }} type="number" placeholder="15" /></div>
            </div>
            <div className="mt-3"><SettingsTextArea label="自动备注" value={settings.auto_attendance_note ?? ""} rows={4} onChange={(value) => { setSettings((prev) => ({ ...prev, auto_attendance_note: value })); setTimeout(() => onAutoSave?.(), 0); }} note="自动生成考勤时附带说明,可留空。" /></div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">美东时间(固定) 每天 {settings.auto_attendance_run_time || "01:00"} 为在职员工按工作日自动生成 {formatMinutes(settings.auto_attendance_default_minutes || 600)} 考勤,再叠加请假 / 加班修正。每餐餐补 {formatMoney(settings.meal_allowance_amount ?? 15)}。{settings.auto_attendance_note?.trim() ? ` 备注:${settings.auto_attendance_note.trim()}` : ""}</div>
          </PanelCard>
        </div>
      ) : null}

      {showQuickPunchModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-700">一键签到</h3><p className="mt-1 text-xs text-slate-700">为员工创建今日考勤记录(默认 10 小时),同一员工今日已有记录则跳过。</p></div><button onClick={() => { setShowQuickPunchModal(false); setQuickPunchError(""); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">员工</p><SmallSelect value={quickPunchEmployeeId} onChange={(v) => { setQuickPunchEmployeeId(v); setQuickPunchError(""); }} options={normalizedEmployees.map((item) => item.id)} labels={Object.fromEntries(normalizedEmployees.map((item) => [item.id, `${item.code} · ${item.name}`]))} /></div>{quickPunchError ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{quickPunchError}</div> : null}<div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => { setShowQuickPunchModal(false); setQuickPunchError(""); }}>取消</ActionBtn><ActionBtn tone="primary" onClick={quickPunchIn}>确认签到</ActionBtn></div></div></div> : null}
      {showAttendanceModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-700">手工补录考勤</h3><p className="mt-1 text-xs text-slate-700">可以指定员工和日期新增考勤,但同一员工同一天不能重复新增。</p></div><button onClick={() => setShowAttendanceModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold text-slate-700">员工</p><SmallSelect value={attendanceDraft.employee_id} onChange={(v) => { setAttendanceDraftError(""); setAttendanceDraft((draft) => ({ ...draft, employee_id: v })); }} options={normalizedEmployees.map((item) => item.id)} labels={Object.fromEntries(normalizedEmployees.map((item) => [item.id, `${item.code} · ${item.name}`]))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">日期</p><SmallInput value={attendanceDraft.date} onChange={(v) => { setAttendanceDraftError(""); setAttendanceDraft((draft) => ({ ...draft, date: v })); }} type="date" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">请假时长(分钟)</p><SmallInput value={attendanceDraft.leave_minutes} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, leave_minutes: v }))} type="number" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">加班时长(分钟)</p><SmallInput value={attendanceDraft.overtime_minutes} onChange={(v) => setAttendanceDraft((draft) => ({ ...draft, overtime_minutes: v }))} type="number" /></div></div>{attendanceDraftError ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{attendanceDraftError}</div> : null}<div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">计算后工作时长:{formatMinutes(calcWorkedMinutes(Number(attendanceDraft.leave_minutes) || 0, Number(attendanceDraft.overtime_minutes) || 0))}</div><div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => setShowAttendanceModal(false)}>取消</ActionBtn><ActionBtn tone="primary" onClick={saveAttendanceDraft}>保存考勤</ActionBtn></div></div></div> : null}{showEmployeeModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"><div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-700">{editingEmployeeId ? "编辑员工" : "新建员工"}</h3><p className="mt-1 text-xs text-slate-700">工号自动递增,从 001 开始。</p></div><button onClick={() => setShowEmployeeModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold text-slate-700">姓名</p><SmallInput value={employeeDraft.name} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, name: v }))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">电话</p><SmallInput value={employeeDraft.phone} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, phone: v }))} /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">时薪</p><SmallInput value={employeeDraft.hourly_rate} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, hourly_rate: v }))} type="number" /></div><div><p className="mb-1 text-[11px] font-semibold text-slate-700">分组</p><SmallSelect value={employeeDraft.ethnicity} onChange={(v) => setEmployeeDraft((draft) => ({ ...draft, ethnicity: v }))} options={[...EMPLOYEE_GROUP_OPTIONS]} /></div></div><div className="mt-4"><p className="mb-2 text-[11px] font-semibold text-slate-700">工作日</p><div className="flex flex-wrap gap-2">{WORKDAY_OPTIONS.map((option) => { const checked = employeeDraft.workdays.includes(option.key); return <label key={option.key} className={`rounded-lg border px-3 py-2 text-xs ${checked ? "border-gray-200 bg-gray-50 text-slate-800" : "border-gray-200 bg-gray-50 text-slate-600"}`}><input type="checkbox" className="mr-2" checked={checked} onChange={(e) => setEmployeeDraft((draft) => ({ ...draft, workdays: e.target.checked ? [...draft.workdays, option.key] : draft.workdays.filter((day) => day !== option.key) }))} />{option.label}</label>; })}</div></div><label className="mt-4 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={employeeDraft.meal_allowance_eligible} onChange={(e) => setEmployeeDraft((draft) => ({ ...draft, meal_allowance_eligible: e.target.checked }))} /> 饭补资格</label><div className="mt-5 flex justify-end gap-2"><ActionBtn onClick={() => setShowEmployeeModal(false)}>取消</ActionBtn><ActionBtn tone="primary" onClick={saveEmployee}>保存员工</ActionBtn></div></div></div> : null}
    </div>
  );
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
  return <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-6"><label className="w-28 shrink-0 pt-2 text-xs font-semibold text-slate-600">{label}</label><div className="flex-1"><input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="h-8 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-gray-200 focus:outline-none" />{note && <p className="mt-1 text-[11px] text-slate-700">{note}</p>}</div></div>;
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode; }) {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><h3 className="mb-3 border-b border-gray-200 pb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700">{title}</h3><div className="flex flex-col gap-3.5">{children}</div></div>;
}

function SettingsTextArea({
  label,
  value,
  note,
  rows = 5,
  onChange,
}: {
  label: string;
  value: string;
  note?: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return <div className="flex flex-col gap-1"><label className="text-xs font-semibold text-slate-600">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-gray-200 focus:outline-none resize-none" />{note && <p className="text-[11px] text-slate-700">{note}</p>}</div>;
}

type SettingsPageKey = "company-base" | "company-contact" | "finance" | "lists" | "categories"

function SettingsPrintPreview({ settings, onUpdate }: { settings: BizSettings; onUpdate: (key: keyof BizSettings, value: string) => void; }) {
  const [previewType, setPreviewType] = useState<"invoice" | "pickup">("invoice");

  // Sample data for preview rendering
  const sampleOrder: BizOrder = {
    order_number: "预览-001",
    order_type: "定制单",
    client_name: "示例客户",
    phone: "123-456-7890",
    address: "123 Main St, New York, NY 10001",
    total_price: 1500,
    tax_rate: settings.default_tax_rate || 8,
    total_after_tax: 1620,
    amount_paid: 500,
    balance: 1120,
    order_date: new Date().toISOString().slice(0, 10),
    status: "加工中",
    material_rows: [
      { name: "Sample Granite", spec: "12×24", qty: 10, unit: "pcs", unit_price: 150 },
      { name: "Sample Marble", spec: "24×24", qty: 5, unit: "pcs", unit_price: 200 },
    ],
    payment_history: [{ date: new Date().toISOString().slice(0, 10), amount: 500, method: "现金", note: "定金支付", type: "payment" }],
  };

  const sampleDraft: DraftFields = {
    client_name: "示例客户",
    phone: "123-456-7890",
    address: "123 Main St, New York, NY 10001",
    preview_image: "",
    total_price: 1500,
    tax_rate: settings.default_tax_rate || 8,
    discount: 0,
    description: "实例加工说明示例",
    install_info: "安装说明示例",
    remarks: settings.invoice_note || "备注模板示例",
  };

  const rawHtml = previewType === "invoice"
    ? buildCustomerInvoiceHTML(sampleOrder, sampleDraft, sampleOrder.material_rows ?? [], settings)
    : buildWorkerPickupHTML(sampleOrder, sampleOrder.material_rows ?? [], settings);
  const html = rawHtml.replace(/<script>window\.onload\s*=\s*function\s*\(\s*\)\s*\{\s*window\.print\s*\(\s*\)\s*;?\s*\}<\/script>/gi, "");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setPreviewType("invoice")} className={`rounded-lg border px-3 py-1 text-[11px] font-semibold transition-colors ${previewType === "invoice" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}>发票 Invoice</button>
        <button onClick={() => setPreviewType("pickup")} className={`rounded-lg border px-3 py-1 text-[11px] font-semibold transition-colors ${previewType === "pickup" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}>领料单 Pickup</button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200" style={{ height: 520 }}>
        <iframe
          srcDoc={html}
          title="打印预览"
          className="h-full w-full border-0"
          style={{ transform: "scale(0.65)", transformOrigin: "top left", width: `${100 / 0.65}%`, height: `${100 / 0.65}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-500">预览为缩略显示，实际打印为全尺寸A4</p>
    </div>
  );
}
function SettingsSection({ settings, setSettings, saveState, isDirty, lastSavedAt, onSave, isSaving }: { settings: BizSettings; setSettings: React.Dispatch<React.SetStateAction<BizSettings>>; saveState: "idle" | "saving" | "saved" | "error" | "conflict"; isDirty: boolean; lastSavedAt: string; onSave?: () => void; isSaving?: boolean; }) {
  const pages: Array<{ key: SettingsPageKey; label: string; note: string }> = [
    { key: "company-base", label: "1. 公司基础 + 打印模板", note: "公司信息、打印标题、模板备注、预览" },
    { key: "company-contact", label: "2. 联系方式", note: "电话、邮箱、网站、 Logo" },
    { key: "finance", label: "3. 财务收款", note: "税率默认值、收款方式" },
    { key: "lists", label: "4. 分类列表", note: "支付类型和供应商分类" },
    { key: "categories", label: "5. 物料分类", note: "物料管理分类列表" },
  ]
  const [page, setPage] = useState<SettingsPageKey>("company-base");
  const pageIndex = pages.findIndex((item) => item.key === page);
  const currentPage = pages[pageIndex] ?? pages[0];

  const update = (key: keyof BizSettings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: key === "default_tax_rate" || key === "fiscal_start_month" || key === "quote_valid_days" || key === "meal_allowance_amount" || key === "auto_attendance_default_minutes"
        ? Number(value) || 0
        : value,
    }));
  };

  const expenseTypeValue = settings.expense_types || "采购\n工资\n物流\n办公\n其他";
  const supplierCategoryValue = settings.supplier_categories || "布料\n五金\n玻璃\n物流\n其他";
  const saveTone = saveState === "error" || saveState === "conflict"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : saveState === "saving"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : isDirty
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const saveText = saveState === "saving"
    ? "正在保存设置..."
    : saveState === "conflict"
      ? "设置保存冲突,请刷新后重试"
      : saveState === "error"
        ? "设置保存失败"
        : isDirty
          ? "当前有未保存更改"
          : lastSavedAt
            ? `设置已保存成功 · ${lastSavedAt}`
            : "当前设置已同步";

  const saveStatusBar = saveState === "conflict"
    ? "保存冲突,请刷新后重试"
    : saveState === "error"
      ? "保存失败"
      : isDirty
        ? "有未保存的更改"
        : lastSavedAt
          ? `已保存 · ${lastSavedAt}`
          : "";

  return (
    <div className="space-y-3 xl:space-y-2">
      <SectionHeader
        eyebrow="Configuration"
        title="系统设置"
        actions={saveStatusBar ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{saveStatusBar}</div> : null}
      />

      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="text-xs font-medium text-amber-700">{isDirty ? "当前有未保存的系统设置" : "所有系统设置已同步"}</span>
        <ActionBtn tone={isDirty ? "primary" : "success"} disabled={!isDirty || isSaving} onClick={onSave}>{isSaving ? "保存中..." : "保存设置"}</ActionBtn>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-slate-700">当前分页</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{currentPage.label}</p>
            <p className="mt-1 text-xs text-slate-700">{currentPage.note}</p>
          </div>
          <div className="flex items-center gap-2">
            <ActionBtn disabled={pageIndex === 0} onClick={() => setPage(pages[Math.max(0, pageIndex - 1)].key)}>{"← 上一页"}</ActionBtn>
            <div className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">第 {pageIndex + 1} / {pages.length} 页</div>
            <ActionBtn disabled={pageIndex === pages.length - 1} onClick={() => setPage(pages[Math.min(pages.length - 1, pageIndex + 1)].key)}>{"下一页 →"}</ActionBtn>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {pages.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${page === item.key ? "border-gray-200 bg-gray-50 text-slate-800" : "border-gray-200 bg-gray-50 text-slate-600 hover:border-gray-200 hover:text-slate-800"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[320px]">
                        {page === "company-base" ? (
          <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-3">
              <SettingsGroup title="公司信息">
                <SettingsField label="公司名称" value={settings.company_name} onChange={(value) => update("company_name", value)} />
                <SettingsField label="公司名称中" value={settings.company_name_zh ?? ""} onChange={(value) => update("company_name_zh", value)} />
                <SettingsField label="柜台地址" value={settings.address} onChange={(value) => update("address", value)} />
                <SettingsField label="打印地址" value={settings.company_address ?? ""} onChange={(value) => update("company_address", value)} />
              </SettingsGroup>
              <SettingsGroup title="打印标题与备注">
                <SettingsField label="Invoice 标题" value={settings.invoice_title ?? "Invoice"} onChange={(value) => update("invoice_title", value)} />
                <SettingsField label="领料单标题" value={settings.picking_title ?? "领料单 / Worker Pickup Sheet"} onChange={(value) => update("picking_title", value)} />
                <SettingsField label="Logo URL" value={settings.logo_url ?? ""} onChange={(value) => update("logo_url", value)} />
                <SettingsTextArea label="发票备注" value={settings.invoice_note ?? ""} rows={5} onChange={(value) => update("invoice_note", value)} />
                <SettingsTextArea label="报价页脚备注" value={settings.quote_footer ?? ""} rows={3} onChange={(value) => update("quote_footer", value)} />
              </SettingsGroup>
            </div>
            <div>
              <SettingsGroup title="打印预览">
                <SettingsPrintPreview settings={settings} onUpdate={update} />
              </SettingsGroup>
            </div>
          </div>
        ) : null}

        {page === "company-contact" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <SettingsGroup title="联系方式">
              <SettingsField label="后台电话" value={settings.phone} onChange={(value) => update("phone", value)} />
              <SettingsField label="打印电话" value={settings.phones ?? ""} onChange={(value) => update("phones", value)} />
              <SettingsField label="电子邮箱" value={settings.email} onChange={(value) => update("email", value)} />
              <SettingsField label="网站" value={settings.website} onChange={(value) => update("website", value)} />
              <SettingsField label="Logo URL" value={settings.logo_url ?? ""} onChange={(value) => update("logo_url", value)} />
            </SettingsGroup>
            <SettingsGroup title="保存确认">
              <div className="space-y-3 text-xs text-slate-600">
                <p>这里不再自动保存,改完后请点页面上方的"保存更改"。</p>
                <p>看到 <span className="font-semibold text-emerald-700">设置已保存成功</span>,才表示服务端真的写入成功。</p>
                <p>考勤工资规则已经从系统设置移走,只在员工管理里维护。</p>
              </div>
            </SettingsGroup>
          </div>
        ) : null}

        {page === "finance" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <SettingsGroup title="税务与默认值">
              <SettingsField label="税号 (BN)" value={settings.tax_number} note="Business Number" onChange={(value) => update("tax_number", value)} />
              <SettingsField label="默认税率" value={String(settings.default_tax_rate)} onChange={(value) => update("default_tax_rate", value)} type="number" />
              <SettingsField label="默认货币" value={settings.default_currency} onChange={(value) => update("default_currency", value)} />
              <SettingsField label="财年开始月" value={String(settings.fiscal_start_month)} onChange={(value) => update("fiscal_start_month", value)} type="number" />
              <SettingsField label="报价默认有效期" value={String(settings.quote_valid_days ?? 30)} onChange={(value) => update("quote_valid_days", value)} type="number" />
            </SettingsGroup>
            <SettingsGroup title="收款方式">
              <SettingsField label="银行账户" value={settings.bank_account} onChange={(value) => update("bank_account", value)} />
              <SettingsField label="支付宝" value={settings.alipay} onChange={(value) => update("alipay", value)} />
              <SettingsField label="微信收款" value={settings.wechat_pay} onChange={(value) => update("wechat_pay", value)} />
              <SettingsField label="其他方式" value={settings.other_payment} onChange={(value) => update("other_payment", value)} />
              <SettingsField label="Zelle" value={settings.zelle ?? ""} onChange={(value) => update("zelle", value)} />
            </SettingsGroup>
          </div>
        ) : null}



        {page === "lists" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <SettingsGroup title="支出类型">
              <SettingsTextArea label="支出类型列表" value={expenseTypeValue} rows={8} onChange={(value) => update("expense_types", value)} note="一行一个,或者用逗号分隔。收支管理会直接读取这里。" />
            </SettingsGroup>
            <SettingsGroup title="供应商分类">
              <SettingsTextArea label="供应商分类列表" value={supplierCategoryValue} rows={8} onChange={(value) => update("supplier_categories", value)} note="一行一个,或者用逗号分隔。供应商新增/编辑会直接读取这里。" />
            </SettingsGroup>
          </div>
        ) : null}

        {page === "categories" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <SettingsGroup title="物料分类">
              <SettingsField label="物料分类" value={settings.material_categories ?? ""} onChange={(value) => update("material_categories", value)} note="用逗号分隔,例如:布料,五金,配件" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(settings.material_categories || "").split(/[,，]+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 border border-slate-200">{tag}</span>
                ))}
              </div>
            </SettingsGroup>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

type Section =
  | "overview"
  | "orders"
  | "finance"
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
    ],
  },
  {
    label: "资源管理",
    items: [
      { key: "clients", label: "客户档案", icon: "⊙" },
      { key: "appointments", label: "量尺寸", icon: "⏰" },
      { key: "materials", label: "物料管理", icon: "◫" },
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
  const [appointments, setAppointments] = useState<MeasurementAppointmentRecord[]>(bizAppointments);
  const [clients, setClients] = useState<ContactRecord[]>(bizClients);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(bizSuppliers);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(bizExpenses);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(bizCashEntries);
  const [materials, setMaterials] = useState<MaterialRecord[]>(bizMaterials);
  const [employees, setEmployees] = useState<EmployeeRecord[]>(bizEmployees);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>(bizAttendances);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>(bizPayrolls);
  const [printArchives, setPrintArchives] = useState<PrintArchiveRecord[]>(bizPrintArchives);
  const [settings, setSettings] = useState<BizSettings>(bizSettings);
  const [storeRevision, setStoreRevision] = useState("");
  const [savedSnapshotJson, setSavedSnapshotJson] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [showVoided, setShowVoided] = useState(false);
  const linkedDirectory = useMemo(() => linkDirectoryEntities(clients, suppliers), [clients, suppliers]);
  const orderSummary = useMemo(() => summarizeOrders(orders.filter((o) => o.status !== "已作废")), [orders]);
  const snapshot = useMemo(() => buildBizSnapshot({
    revision: storeRevision,
    orders,
    clients: linkedDirectory.clients,
    suppliers: linkedDirectory.suppliers,
    expenses,
    cashEntries,
    materials,
    employees,
    attendances,
    appointments,
    payrolls,
    printArchives,
    settings,
  }), [storeRevision, orders, clients, suppliers, expenses, cashEntries, materials, employees, attendances, appointments, payrolls, printArchives, settings]);
  const snapshotJson = useMemo(() => serializeBizSnapshot(snapshot), [snapshot]);
  const isDirty = isHydrated && snapshotJson !== savedSnapshotJson;

  useEffect(() => {
    if (!isHydrated) return;
    setCashEntries((prev) => {
      const reconciled = reconcileCashEntries(prev, orders, expenses);
      return sameCashEntryList(prev, reconciled) ? prev : reconciled;
    });
  }, [isHydrated, orders, expenses]);

  useEffect(() => {
    let cancelled = false;

    async function loadStore() {
      try {
        const response = await fetch("/api/biz-store", { cache: "no-store" });
        if (!response.ok) throw new Error("load failed");
        const payload = (await response.json()) as { ok: boolean; data: BizStoreSnapshot };
        if (cancelled || !payload?.data) return;
        const loadedSnapshot = buildBizSnapshot(payload.data);
        const loadedSnapshotJson = serializeBizSnapshot(loadedSnapshot);
        let hydratedSnapshot = loadedSnapshot;
        try {
          const liveBackup = localStorage.getItem("biz-store-live-backup");
          if (liveBackup) {
            const parsedBackup = JSON.parse(liveBackup) as Partial<BizStoreSnapshot>;
            const backupSnapshot = buildBizSnapshot(parsedBackup);
            const backupSnapshotJson = serializeBizSnapshot(backupSnapshot);
            if (backupSnapshot.revision === loadedSnapshot.revision && backupSnapshotJson !== loadedSnapshotJson) {
              hydratedSnapshot = backupSnapshot;
            }
          }
        } catch {}
        setStoreRevision(hydratedSnapshot.revision);
        setOrders(hydratedSnapshot.orders);
        setClients(hydratedSnapshot.clients);
        setSuppliers(hydratedSnapshot.suppliers);
        setExpenses(hydratedSnapshot.expenses);
        setCashEntries(hydratedSnapshot.cashEntries);
        setMaterials(hydratedSnapshot.materials);
        setEmployees(hydratedSnapshot.employees);
        setAttendances(hydratedSnapshot.attendances);
        setAppointments(hydratedSnapshot.appointments ?? []);
        setPayrolls(hydratedSnapshot.payrolls);
        setPrintArchives(hydratedSnapshot.printArchives);
        setSettings(hydratedSnapshot.settings);
        setSavedSnapshotJson(loadedSnapshotJson);
        try {
          localStorage.setItem("biz-store-backup", loadedSnapshotJson);
          localStorage.setItem("biz-store-live-backup", serializeBizSnapshot(hydratedSnapshot));
        } catch {}
      } catch {
        setSaveState("error");
        try {
          const backup = localStorage.getItem("biz-store-backup");
          if (backup) {
            const parsed = JSON.parse(backup) as Partial<BizStoreSnapshot>;
            const backupSnapshot = buildBizSnapshot(parsed);
            setStoreRevision(backupSnapshot.revision);
            setOrders(backupSnapshot.orders);
            setClients(backupSnapshot.clients);
            setSuppliers(backupSnapshot.suppliers);
            setExpenses(backupSnapshot.expenses);
            setCashEntries(backupSnapshot.cashEntries);
            setMaterials(backupSnapshot.materials);
            setEmployees(backupSnapshot.employees);
            setAttendances(backupSnapshot.attendances);
            setAppointments(backupSnapshot.appointments ?? []);
            setPayrolls(backupSnapshot.payrolls);
            setPrintArchives(backupSnapshot.printArchives);
            setSettings(backupSnapshot.settings);
            setSavedSnapshotJson(serializeBizSnapshot(backupSnapshot));
          } else {
            const initialSnapshot = buildBizSnapshot({
              orders: bizOrders,
              clients: bizClients,
              suppliers: bizSuppliers,
              expenses: bizExpenses,
              cashEntries: bizCashEntries,
              materials: bizMaterials,
              employees: bizEmployees,
              attendances: bizAttendances,
              payrolls: bizPayrolls,
              printArchives: bizPrintArchives,
              settings: bizSettings,
            });
            setSavedSnapshotJson(serializeBizSnapshot(initialSnapshot));
          }
        } catch {}
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
    if (!isHydrated || saveState === "saving") return;
    if (snapshotJson !== savedSnapshotJson && saveState !== "idle") {
      setSaveState("idle");
    }
  }, [isHydrated, saveState, savedSnapshotJson, snapshotJson]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem("biz-store-live-backup", snapshotJson);
    } catch {}
  }, [isHydrated, snapshotJson]);

  const persistSnapshotRef = useRef(persistSnapshot);
  persistSnapshotRef.current = persistSnapshot;

  async function persistSnapshot() {
    if (!isHydrated || saveState === "saving") return;

    try {
      setSaveState("saving");
      const response = await fetch("/api/biz-store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshotJson,
      });
      if (response.status === 409) {
        setSaveState("conflict");
        return;
      }
      if (!response.ok) throw new Error("save failed");
      const payload = (await response.json()) as { ok: boolean; data: BizStoreSnapshot };
      const nextSnapshot = buildBizSnapshot({ ...snapshot, revision: payload.data.revision ?? snapshot.revision });
      const nextSnapshotJson = serializeBizSnapshot(nextSnapshot);
      setStoreRevision(nextSnapshot.revision);
      setSavedSnapshotJson(nextSnapshotJson);
      setLastSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      try {
        localStorage.setItem("biz-store-backup", nextSnapshotJson);
        localStorage.setItem("biz-store-live-backup", nextSnapshotJson);
      } catch {}
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const autoSave = useCallback(() => {
    setTimeout(() => persistSnapshotRef.current(), 0);
  }, []);

  const isSaving = saveState === "saving";

  return (
    <PageSection>
      <DashboardPageHeader
        eyebrow="Owner Backend · Business"
        title="业务管理"
        description="订单、财务、客户、物料、员工与设置的统一操作界面。"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {section === "orders" && <button
            onClick={() => setShowVoided((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showVoided
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-gray-200 bg-white text-slate-600 hover:border-gray-300"
            }`}
          >
            {showVoided ? "隐藏已作废" : "显示已作废"}
          </button>}
          {saveState === "conflict" ? <span className="text-xs text-rose-600">保存冲突,请刷新后重试</span> : null}
          {saveState === "error" ? <span className="text-xs text-rose-600">保存失败</span> : null}
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      <div className="mt-4 flex min-h-[600px] overflow-hidden rounded-[20px] bg-white shadow-sm">
        <nav className="w-40 shrink-0 border-r border-gray-200 bg-gray-100 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-700">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium transition-colors ${
                    section === item.key
                      ? "bg-gray-50 text-slate-700 shadow-sm border-r-2 border-gray-200"
                      : "text-slate-700 hover:bg-gray-50/60 hover:text-slate-800"
                  }`}
                >
                  <span className="text-sm leading-none">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1 overflow-x-auto p-5" >
          {section === "overview" && (
            <OverviewSection
              onNavigate={(k) => setSection(k as Section)}
              orderSummary={orderSummary}
              expenses={expenses}
              payrolls={payrolls}
              clients={clients}
              suppliers={suppliers}
              materials={materials}
              employees={employees}
            />
          )}
          {section === "orders" && <OrdersSection orders={showVoided ? orders : orders.filter((o) => o.status !== "已作废")} materials={materials} clients={clients} setOrders={setOrders} settings={settings} setSettings={setSettings} printArchives={printArchives} setPrintArchives={setPrintArchives} setCashEntries={setCashEntries} setExpenses={setExpenses} onAutoSave={autoSave} />}
          {section === "finance" && (
            <FinanceSection
              orders={showVoided ? orders : orders.filter((o) => o.status !== "已作废")}
              setOrders={setOrders}
              expenses={showVoided ? expenses : expenses.filter((e) => !e.voided)}
              setExpenses={setExpenses}
              cashEntries={showVoided ? cashEntries : cashEntries.filter((c) => !c.voided)}
              setCashEntries={setCashEntries}
              payrolls={payrolls}
              setPayrolls={setPayrolls}
              clients={clients}
              setClients={setClients}
              suppliers={suppliers}
              employees={employees}
              settings={settings}
              onAutoSave={autoSave}
            />
          )}

          {section === "clients" && (
            <ClientsSection
              clients={clients}
              setClients={setClients}
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              orders={showVoided ? orders : orders.filter((o) => o.status !== "已作废")}
              setOrders={setOrders}
              appointments={appointments}
              setAppointments={setAppointments}
              setCashEntries={setCashEntries}
              setExpenses={setExpenses}
              materials={materials}
              setMaterials={setMaterials}
              settings={settings}
              setSettings={setSettings}
              onAutoSave={autoSave}
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
              suppliers={suppliers}
              orders={showVoided ? orders : orders.filter((o) => o.status !== "已作废")}
              setExpenses={setExpenses}
              setCashEntries={setCashEntries}
              materialCategoryOptions={["", ...(settings.material_categories || "").split(/[,，]+/).map((t) => t.trim()).filter(Boolean)]}
              onAutoSave={autoSave}
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
              onAutoSave={autoSave}
            />
          )}
          {section === "settings" && <SettingsSection settings={settings} setSettings={setSettings} saveState={saveState} isDirty={isDirty} lastSavedAt={lastSavedAt} onSave={persistSnapshot} isSaving={isSaving} />}
        </div>
      </div>

    </PageSection>
  );
}

function AppointmentsSection({ appointments, setAppointments, clients }: { appointments: MeasurementAppointmentRecord[]; setAppointments: (v: MeasurementAppointmentRecord[]) => void; clients: ContactRecord[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MeasurementAppointmentRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draft, setDraft] = useState({ client_id: "", appointment_date: "", appointment_time: "", phone: "", address: "", description: "" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow" | "date">("all");
  const [specificDate, setSpecificDate] = useState(new Date().toISOString().slice(0, 10));

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  function format12h(time: string) {
    if (!time) return "";
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    if (isNaN(hour)) return time;
    const ampm = hour >= 12 ? "pm" : "am";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  }

  function formatCopyDate(date: string) {
    if (!date) return "";
    // Handle both "YYYY-MM-DD" and "YYYY/M/D" formats
    const parts = date.includes("/") ? date.split("/") : date.split("-");
    if (parts.length < 3) return date;
    const [y, m, d] = parts;
    if (!y || !m || !d) return date;
    return `${y}/${Number(m)}/${Number(d)}`;
  }

  function formatAppointmentItem(item: MeasurementAppointmentRecord) {
    const lines = [
      `预约日期：${formatCopyDate(item.appointment_date)}`,
      `预约时间段：${format12h(item.appointment_time ?? "")}`,
      `描述：`,
      `${item.description ?? ""}`,
      `客户名：${item.client_name}`,
      `地址：${item.address ?? ""}`,
      `电话：${item.phone ?? ""}`,
    ];
    return lines.join("\n");
  }

  const filteredByDate = dateFilter === "all"
    ? appointments
    : dateFilter === "today"
      ? appointments.filter((a) => a.appointment_date === todayStr)
      : dateFilter === "tomorrow"
        ? appointments.filter((a) => a.appointment_date === tomorrowStr)
        : appointments.filter((a) => a.appointment_date === specificDate);

  const filtered = search
    ? filteredByDate.filter((a) => a.client_name.toLowerCase().includes(search.toLowerCase()) || (a.phone ?? "").includes(search))
    : filteredByDate;

  const sorted = [...filtered].sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  function openNew() {
    setEditing(null);
    setDraft({ client_id: "", appointment_date: new Date().toISOString().slice(0, 10), appointment_time: "", phone: "", address: "", description: "" });
    setShowModal(true);
  }

  function openEdit(item: MeasurementAppointmentRecord) {
    setEditing(item);
    setDraft({ client_id: item.client_id ?? "", appointment_date: item.appointment_date, appointment_time: item.appointment_time ?? "", phone: item.phone ?? "", address: item.address ?? "", description: item.description ?? "" });
    setShowModal(true);
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    setDraft((d) => ({ ...d, client_id: clientId, phone: client?.phone ?? "", address: client?.address ?? "" }));
  }

  function handleSave() {
    if (!draft.appointment_date) return;
    const client = clients.find((c) => c.id === draft.client_id);
    const name = client?.name ?? "";
    if (!name) return;
    if (editing) {
      setAppointments(appointments.map((a) => a.id === editing.id ? { ...a, appointment_date: draft.appointment_date, appointment_time: draft.appointment_time || undefined, phone: draft.phone || undefined, address: draft.address || undefined, description: draft.description || undefined } : a));
    } else {
      const newId = nextSequentialId(appointments.map((a) => a.id), "APT");
      setAppointments([{ id: newId, client_name: name, client_id: draft.client_id, phone: draft.phone || undefined, appointment_date: draft.appointment_date, appointment_time: draft.appointment_time || undefined, address: draft.address || undefined, description: draft.description || undefined }, ...appointments]);
    }
    setShowModal(false);
    setEditing(null);
  }

  function copyToClipboard(text: string, onSuccess: () => void) {
    // Try modern clipboard API first, fall back to textarea select
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text);
        onSuccess();
      });
    } else {
      fallbackCopy(text);
      onSuccess();
    }
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }

  function handleCopy(item: MeasurementAppointmentRecord) {
    copyToClipboard(formatAppointmentItem(item), () => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleCopyAll() {
    const separator = "\n----------------------------\n";
    const text = sorted.map(formatAppointmentItem).join(separator);
    copyToClipboard(text, () => {});
  }

  return (
    <>
      <SectionHeader eyebrow="Measurements" title="量尺寸" actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => { setDateFilter("all"); setPage(1); }} className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${dateFilter === "all" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>全部</button>
            <button onClick={() => { setDateFilter("today"); setPage(1); }} className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${dateFilter === "today" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>今天</button>
            <button onClick={() => { setDateFilter("tomorrow"); setPage(1); }} className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${dateFilter === "tomorrow" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>明天</button>
            <button onClick={() => setDateFilter("date")} className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${dateFilter === "date" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>选择日期</button>
            {dateFilter === "date" && (
              <input type="date" value={specificDate} onChange={(e) => { setSpecificDate(e.target.value); setPage(1); }} className="ml-1 h-7 rounded-md border border-slate-300 px-1 text-[11px] text-slate-700" />
            )}
          </div>
          <div className="relative w-52">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-700">⌕</span>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜索客户姓名 / 电话" className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-700" />
          </div>
          <ActionBtn onClick={handleCopyAll}>{sorted.length > 0 ? `一键复制全部 (${sorted.length})` : "一键复制全部"}</ActionBtn>
          <ActionBtn onClick={openNew} tone="primary">+ 新建预约</ActionBtn>
        </div>
      } />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2 font-semibold text-slate-600">日期</th>
              <th className="px-3 py-2 font-semibold text-slate-600">时间</th>
              <th className="px-3 py-2 font-semibold text-slate-600">客户</th>
              <th className="px-3 py-2 font-semibold text-slate-600">电话</th>
              <th className="px-3 py-2 font-semibold text-slate-600">地址</th>
              <th className="px-3 py-2 font-semibold text-slate-600">描述</th>
              <th className="px-3 py-2 font-semibold text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((item) => (
              <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                <td className="px-3 py-2 text-slate-700">{item.appointment_date}</td>
                <td className="px-3 py-2 text-slate-600">{item.appointment_time ?? "-"}</td>
                <td className="px-3 py-2 font-medium text-slate-700">{item.client_name}</td>
                <td className="px-3 py-2 text-slate-600">{item.phone ?? "-"}</td>
                <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.address ?? "-"}</td>
                <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{item.description ?? "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button onClick={() => handleCopy(item)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 transition-colors">{copiedId === item.id ? "已复制 ✓" : "复制"}</button>
                    <button onClick={() => openEdit(item)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 transition-colors">编辑</button>
                    {confirmDelete === item.id ? (
                      <>
                        <button onClick={() => { setAppointments(appointments.filter((a) => a.id !== item.id)); setConfirmDelete(null); }} className="rounded-md border border-red-400 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100">确认</button>
                        <button onClick={() => setConfirmDelete(null)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-300">取消</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(item.id)} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-slate-700 hover:border-rose-300 hover:text-rose-600 transition-colors">删除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!paged.length ? <div className="py-10 text-center text-xs text-slate-700">{search ? "没有匹配的预约" : "还没有任何量尺寸预约"}</div> : null}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-700">
          <span>第 {page} / {pageCount} 页,共 {sorted.length} 条</span>
          <div className="flex gap-1">
            <ActionBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一页</ActionBtn>
            <ActionBtn onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>下一页</ActionBtn>
          </div>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-700">{editing ? "编辑预约" : "新建预约"}</h3>
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:text-slate-700 transition-colors">关闭</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">客户</label>
                <input
                  type="text"
                  list="apt-client-list"
                  value={clients.find((c) => c.id === draft.client_id)?.name ?? ""}
                  onChange={(e) => {
                    const match = clients.find((c) => c.name === e.target.value);
                    if (match) handleClientChange(match.id);
                  }}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700"
                  placeholder="搜索客户姓名…"
                />
                <datalist id="apt-client-list">
                  {clients.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">日期</label>
                  <input type="date" value={draft.appointment_date} onChange={(e) => setDraft((d) => ({ ...d, appointment_date: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-700">时间</label>
                  <input type="time" value={draft.appointment_time} onChange={(e) => setDraft((d) => ({ ...d, appointment_time: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">电话</label>
                <input type="text" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="自动从客户资料填入" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">地址</label>
                <input type="text" value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="自动从客户资料填入" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">描述</label>
                <input type="text" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700" placeholder="备注说明" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <ActionBtn onClick={() => setShowModal(false)}>取消</ActionBtn>
              <ActionBtn tone="primary" onClick={handleSave}>确认</ActionBtn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

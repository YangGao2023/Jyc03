import rawOrders from "../data/biz-orders.json";
import rawAssets from "../data/biz-assets.json";

export type PaymentRecord = {
  date: string;
  amount: number;
  method: string;
  note?: string;
  type: "payment" | "refund";
};

export type MaterialRow = {
  name: string;
  spec?: string;
  qty: number;
  unit: string;
  unit_price: number;
  image?: string;
};

export type BizOrder = {
  order_number: string;
  order_type: "定制单" | "批发单" | string;
  client_name: string;
  phone?: string;
  address?: string;
  preview_image?: string;
  description?: string;
  total_price?: number;
  tax_rate?: number;
  discount?: number;
  total_after_tax?: number;
  amount_paid?: number;
  balance?: number;
  order_date?: string;
  status?: "下单" | "未付清" | "结清" | "已关闭" | string;
  operation_type?: "售货" | "退货" | string;
  install_info?: string;
  remarks?: string;
  payment_history?: PaymentRecord[];
  material_rows?: MaterialRow[];
};

export type ContactRecord = {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at?: string;
  note?: string;
  is_vip?: boolean;
  balance?: number;
  wechat?: string;
};

export type SupplierRecord = {
  id: string;
  name: string;
  category?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  last_purchase_date?: string;
  remark?: string;
};

export type ExpenseRecord = {
  id: string;
  target: string;
  detail: string;
  amount: number;
  expense_type: string;
  payment_method: string;
  expense_date: string;
  remark?: string;
};

export type CashEntry = {
  id: string;
  type: "收入" | "支出" | string;
  amount: number;
  date: string;
  note?: string;
};

export type MaterialRecord = {
  id: string;
  code: string;
  name: string;
  specification?: string;
  unit: string;
  stock_quantity: number;
  min_stock: number;
  purchase_price: number;
  supplier?: string;
  last_stock_date?: string;
  remark?: string;
};

export type PurchaseRecord = {
  id: string;
  supplier: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  purchase_date: string;
  status: string;
};

export type EmployeeRecord = {
  id: string;
  name: string;
  position?: string;
  phone?: string;
  hire_date?: string;
  contract_end?: string;
  monthly_salary: number;
  status: string;
};

export type MeasurementAppointmentRecord = {
  id: string;
  client_name: string;
  client_id?: string;
  phone?: string;
  address?: string;
  appointment_date: string;
  description?: string;
  gcal_event_id?: string;
};

export type PayrollRecord = {
  id: string;
  month: string;
  employee_name: string;
  base_salary: number;
  bonus: number;
  deduction: number;
  net_salary: number;
  payment_status: string;
};

export type QuoteRecord = {
  id: string;
  client_name: string;
  title: string;
  amount: number;
  created_at: string;
  valid_until: string;
  status: string;
};

export type ShowcaseRecord = {
  id: string;
  name: string;
  category: string;
  image_count: number;
  description?: string;
  created_at: string;
  status: string;
};

export type BizSettings = {
  company_name: string;
  company_name_zh?: string;
  address: string;
  company_address?: string;
  phone: string;
  phones?: string;
  email: string;
  website: string;
  tax_number: string;
  default_tax_rate: number;
  default_currency: string;
  fiscal_start_month: number;
  bank_account: string;
  alipay: string;
  wechat_pay: string;
  other_payment: string;
  invoice_title?: string;
  picking_title?: string;
  zelle?: string;
  invoice_note?: string;
  quote_valid_days: number;
  quote_footer: string;
  logo_url: string;
};

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toString(value: unknown) {
  return value == null ? "" : String(value);
}

function calculatePaymentNet(history: PaymentRecord[]) {
  return history.reduce(
    (sum, item) => sum + (item.type === "refund" ? -item.amount : item.amount),
    0,
  );
}

function deriveOrderStatus(totalAfterTax: number, amountPaid: number, rawStatus?: unknown) {
  if (totalAfterTax > 0 && amountPaid >= totalAfterTax) return "结清";
  if (amountPaid > 0) return "未付清";
  if (rawStatus != null && String(rawStatus) === "已关闭") return "已关闭";
  return "下单";
}

function normalizeOrder(raw: Record<string, unknown>): BizOrder {
  const totalPrice = toNumber(raw.total_price);

  const paymentHistory: PaymentRecord[] = Array.isArray(raw.payment_history)
    ? (raw.payment_history as Record<string, unknown>[]).map((p) => ({
        date: String(p.date ?? ""),
        amount: toNumber(p.amount),
        method: String(p.method ?? ""),
        note: p.note != null ? String(p.note) : undefined,
        type: p.type === "refund" ? ("refund" as const) : ("payment" as const),
      }))
    : [];

  const materialRows: MaterialRow[] = Array.isArray(raw.material_rows)
    ? (raw.material_rows as Record<string, unknown>[]).map((m) => ({
        name: String(m.name ?? ""),
        spec: m.spec != null ? String(m.spec) : undefined,
        qty: toNumber(m.qty),
        unit: String(m.unit ?? ""),
        unit_price: toNumber(m.unit_price),
        image: m.image != null ? String(m.image) : undefined,
      }))
    : [];

  const taxRate = toNumber(raw.tax_rate);
  const discount = toNumber(raw.discount);
  const totalAfterTax = raw.total_after_tax != null
    ? toNumber(raw.total_after_tax)
    : Math.max(0, totalPrice * (1 + taxRate / 100) - discount);
  const rawAmountPaid = toNumber(raw.amount_paid);
  const amountPaid = paymentHistory.length ? calculatePaymentNet(paymentHistory) : rawAmountPaid;
  const derivedBalance = Math.max(0, totalAfterTax - amountPaid);
  const balance = raw.balance == null ? derivedBalance : Math.max(0, toNumber(raw.balance));
  const status = deriveOrderStatus(totalAfterTax, amountPaid, raw.status);

  return {
    order_number: String(raw.order_number ?? ""),
    order_type: String(raw.order_type ?? "定制单"),
    client_name: String(raw.client_name ?? ""),
    phone: raw.phone != null ? String(raw.phone) : undefined,
    address: raw.address != null ? String(raw.address) : undefined,
    preview_image: raw.preview_image != null ? String(raw.preview_image) : undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    total_price: totalPrice,
    tax_rate: taxRate,
    discount,
    total_after_tax: totalAfterTax,
    amount_paid: amountPaid,
    balance,
    order_date: raw.order_date != null ? String(raw.order_date) : undefined,
    status,
    operation_type: raw.operation_type != null ? String(raw.operation_type) : undefined,
    install_info: raw.install_info != null ? String(raw.install_info) : undefined,
    remarks: raw.remarks != null ? String(raw.remarks) : undefined,
    payment_history: paymentHistory,
    material_rows: materialRows,
  };
}

function normalizeList<T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] {
  return Array.isArray(value)
    ? value.map((item) => map((item ?? {}) as Record<string, unknown>))
    : [];
}

const rawAssetsRecord = (rawAssets ?? {}) as Record<string, unknown>;

export const bizOrders: BizOrder[] = Array.isArray(rawOrders)
  ? rawOrders.map((item) => normalizeOrder((item ?? {}) as Record<string, unknown>))
  : [];

export const bizClients = normalizeList<ContactRecord>(rawAssetsRecord.clients, (item) => ({
  id: toString(item.id),
  name: toString(item.name),
  contact: toString(item.contact) || undefined,
  phone: toString(item.phone) || undefined,
  email: toString(item.email) || undefined,
  address: toString(item.address) || undefined,
  created_at: toString(item.created_at) || undefined,
  note: toString(item.note) || undefined,
  is_vip: Boolean(item.is_vip),
  balance: toNumber(item.balance),
  wechat: toString(item.wechat) || undefined,
}));

export const bizSuppliers = normalizeList<SupplierRecord>(rawAssetsRecord.suppliers, (item) => ({
  id: toString(item.id),
  name: toString(item.name),
  category: toString(item.category) || undefined,
  contact_person: toString(item.contact_person) || undefined,
  phone: toString(item.phone) || undefined,
  email: toString(item.email) || undefined,
  address: toString(item.address) || undefined,
  last_purchase_date: toString(item.last_purchase_date) || undefined,
  remark: toString(item.remark) || undefined,
}));

export const bizExpenses = normalizeList<ExpenseRecord>(rawAssetsRecord.expenses, (item) => ({
  id: toString(item.id),
  target: toString(item.target),
  detail: toString(item.detail),
  amount: toNumber(item.amount),
  expense_type: toString(item.expense_type),
  payment_method: toString(item.payment_method),
  expense_date: toString(item.expense_date),
  remark: toString(item.remark) || undefined,
}));

export const bizCashEntries = normalizeList<CashEntry>(rawAssetsRecord.cash_entries, (item) => ({
  id: toString(item.id),
  type: toString(item.type),
  amount: toNumber(item.amount),
  date: toString(item.date),
  note: toString(item.note) || undefined,
}));

export const bizMaterials = normalizeList<MaterialRecord>(rawAssetsRecord.materials, (item) => ({
  id: toString(item.id),
  code: toString(item.code),
  name: toString(item.name),
  specification: toString(item.specification) || undefined,
  unit: toString(item.unit),
  stock_quantity: toNumber(item.stock_quantity),
  min_stock: toNumber(item.min_stock),
  purchase_price: toNumber(item.purchase_price),
  supplier: toString(item.supplier) || undefined,
  last_stock_date: toString(item.last_stock_date) || undefined,
  remark: toString(item.remark) || undefined,
}));

export const bizPurchases = normalizeList<PurchaseRecord>(rawAssetsRecord.purchases, (item) => ({
  id: toString(item.id),
  supplier: toString(item.supplier),
  item_name: toString(item.item_name),
  quantity: toNumber(item.quantity),
  unit: toString(item.unit),
  unit_price: toNumber(item.unit_price),
  total_amount: toNumber(item.total_amount),
  purchase_date: toString(item.purchase_date),
  status: toString(item.status),
}));

export const bizEmployees = normalizeList<EmployeeRecord>(rawAssetsRecord.employees, (item) => ({
  id: toString(item.id),
  name: toString(item.name),
  position: toString(item.position) || undefined,
  phone: toString(item.phone) || undefined,
  hire_date: toString(item.hire_date) || undefined,
  contract_end: toString(item.contract_end) || undefined,
  monthly_salary: toNumber(item.monthly_salary),
  status: toString(item.status),
}));

export const bizAppointments = normalizeList<MeasurementAppointmentRecord>(rawAssetsRecord.appointments, (item) => ({
  id: toString(item.id),
  client_name: toString(item.client_name),
  client_id: toString(item.client_id) || undefined,
  phone: toString(item.phone) || undefined,
  address: toString(item.address) || undefined,
  appointment_date: toString(item.appointment_date),
  description: toString(item.description) || undefined,
  gcal_event_id: toString(item.gcal_event_id) || undefined,
}));

export const bizPayrolls = normalizeList<PayrollRecord>(rawAssetsRecord.payrolls, (item) => ({
  id: toString(item.id),
  month: toString(item.month),
  employee_name: toString(item.employee_name),
  base_salary: toNumber(item.base_salary),
  bonus: toNumber(item.bonus),
  deduction: toNumber(item.deduction),
  net_salary: toNumber(item.net_salary),
  payment_status: toString(item.payment_status),
}));

export const bizQuotes = normalizeList<QuoteRecord>(rawAssetsRecord.quotes, (item) => ({
  id: toString(item.id),
  client_name: toString(item.client_name),
  title: toString(item.title),
  amount: toNumber(item.amount),
  created_at: toString(item.created_at),
  valid_until: toString(item.valid_until),
  status: toString(item.status),
}));

export const bizShowcases = normalizeList<ShowcaseRecord>(rawAssetsRecord.showcases, (item) => ({
  id: toString(item.id),
  name: toString(item.name),
  category: toString(item.category),
  image_count: toNumber(item.image_count),
  description: toString(item.description) || undefined,
  created_at: toString(item.created_at),
  status: toString(item.status),
}));

export const bizSettings: BizSettings = {
  company_name: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).company_name),
  company_name_zh: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).company_name_zh),
  address: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).address),
  company_address: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).company_address),
  phone: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).phone),
  phones: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).phones),
  email: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).email),
  website: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).website),
  tax_number: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).tax_number),
  default_tax_rate: toNumber(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).default_tax_rate),
  default_currency: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).default_currency),
  fiscal_start_month: toNumber(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).fiscal_start_month),
  bank_account: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).bank_account),
  alipay: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).alipay),
  wechat_pay: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).wechat_pay),
  other_payment: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).other_payment),
  invoice_title: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).invoice_title),
  picking_title: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).picking_title),
  zelle: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).zelle),
  invoice_note: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).invoice_note),
  quote_valid_days: toNumber(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).quote_valid_days),
  quote_footer: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).quote_footer),
  logo_url: toString(rawAssetsRecord.settings && (rawAssetsRecord.settings as Record<string, unknown>).logo_url),
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function summarizeOrders(orders: BizOrder[]) {
  const total = orders.length;
  const custom = orders.filter((item) => item.order_type === "定制单").length;
  const wholesale = orders.filter((item) => item.order_type === "批发单").length;
  const amountPaid = orders.reduce(
    (sum, item) => sum + (item.payment_history?.length ? calculatePaymentNet(item.payment_history) : toNumber(item.amount_paid)),
    0,
  );
  const balance = orders.reduce(
    (sum, item) => sum + Math.max(0, toNumber(item.total_after_tax ?? item.total_price) - (item.payment_history?.length ? calculatePaymentNet(item.payment_history) : toNumber(item.amount_paid))),
    0,
  );

  return {
    total,
    custom,
    wholesale,
    amountPaid,
    balance,
  };
}

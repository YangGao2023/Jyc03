import type {
  BizSettings,
  BizOrder,
  CashEntry,
  ContactRecord,
  EmployeeRecord,
  AttendanceRecord,
  ExpenseRecord,
  MaterialRecord,
  MeasurementAppointmentRecord,
  PayrollRecord,
  PrintArchiveRecord,
  PurchaseRecord,
  QuoteRecord,
  ShowcaseRecord,
  SupplierRecord,
} from "@/lib/biz-data";

export type BizStoreSnapshot = {
  revision: string;
  orders: BizOrder[];
  clients: ContactRecord[];
  suppliers: SupplierRecord[];
  expenses: ExpenseRecord[];
  cashEntries: CashEntry[];
  materials: MaterialRecord[];
  purchases: PurchaseRecord[];
  employees: EmployeeRecord[];
  attendances: AttendanceRecord[];
  appointments?: MeasurementAppointmentRecord[];
  payrolls: PayrollRecord[];
  quotes?: QuoteRecord[];
  showcases?: ShowcaseRecord[];
  printArchives: PrintArchiveRecord[];
  settings: BizSettings;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function val<T>(v: unknown, fallback: T): T {
  return (v == null || v === undefined) ? fallback : v as T;
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (typeof parsed === "string") {
        try { return JSON.parse(parsed); } catch {}
      }
      return parsed;
    } catch { return fallback; }
  }
  return v as T ?? fallback;
}

function nullStr(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

function normalizeRelationText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeRelationPhone(value?: string | null) {
  return value?.replace(/\D+/g, "") ?? "";
}

function resolveClientId(
  clients: ContactRecord[],
  input: { clientId?: string; clientName?: string; phone?: string },
) {
  if (input.clientId && clients.some((item) => item.id === input.clientId)) return input.clientId;
  const normalizedName = normalizeRelationText(input.clientName);
  const normalizedPhone = normalizeRelationPhone(input.phone);
  const nameMatches = normalizedName
    ? clients.filter((item) => normalizeRelationText(item.name) === normalizedName) : [];
  if (normalizedPhone && nameMatches.length > 1) {
    const exactMatches = nameMatches.filter((item) => normalizeRelationPhone(item.phone) === normalizedPhone);
    if (exactMatches.length === 1) return exactMatches[0].id;
  }
  if (nameMatches.length === 1) {
    const matched = nameMatches[0];
    const matchedPhone = normalizeRelationPhone(matched.phone);
    if (!normalizedPhone || !matchedPhone || matchedPhone === normalizedPhone) return matched.id;
  }
  if (normalizedPhone) {
    const phoneMatches = clients.filter((item) => normalizeRelationPhone(item.phone) === normalizedPhone);
    if (phoneMatches.length === 1) return phoneMatches[0].id;
  }
  return undefined;
}

function resolveSupplierId(suppliers: SupplierRecord[], input: { supplierId?: string; supplierName?: string }) {
  if (input.supplierId && suppliers.some((item) => item.id === input.supplierId)) return input.supplierId;
  const normalizedName = normalizeRelationText(input.supplierName);
  if (!normalizedName) return undefined;
  const matches = suppliers.filter((item) => normalizeRelationText(item.name) === normalizedName);
  return matches.length === 1 ? matches[0].id : undefined;
}

export function createStoreRevision() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeSnapshot(snapshot: Partial<BizStoreSnapshot>): BizStoreSnapshot {
  const settings = snapshot.settings;
  const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
  const suppliers = Array.isArray(snapshot.suppliers) ? snapshot.suppliers : [];
  const orders = Array.isArray(snapshot.orders)
    ? snapshot.orders.map((item) => {
        const payment_history = Array.isArray(item.payment_history)
          ? item.payment_history
          : typeof item.payment_history === 'string'
            ? (() => { try { const p = JSON.parse(item.payment_history); return Array.isArray(p) ? p : []; } catch { return []; } })()
            : [];
        return {
          ...item,
          payment_history: payment_history.map((record: any) => ({
            ...record,
            method: record?.method && record?.method !== "旧库导入" ? String(record.method) : "现金",
          })),
          client_id: resolveClientId(clients, {
            clientId: item.client_id, clientName: item.client_name, phone: item.phone,
          }),
        };
      })
    : [];
  const appointments = Array.isArray(snapshot.appointments)
    ? snapshot.appointments.map((item) => ({ ...item, client_id: resolveClientId(clients, { clientId: item.client_id, clientName: item.client_name, phone: item.phone }) }))
    : [];
  const quotes = Array.isArray(snapshot.quotes)
    ? snapshot.quotes.map((item) => ({ ...item, client_id: resolveClientId(clients, { clientId: item.client_id, clientName: item.client_name }) }))
    : [];

  return {
    revision: typeof snapshot.revision === "string" && snapshot.revision.trim() ? snapshot.revision : createStoreRevision(),
    orders, clients, suppliers,
    expenses: Array.isArray(snapshot.expenses)
      ? snapshot.expenses.map((item) => ({ ...item, payment_method: item.payment_method && item.payment_method !== "旧库导入" ? String(item.payment_method) : "现金" })) : [],
    cashEntries: Array.isArray(snapshot.cashEntries)
      ? snapshot.cashEntries.map((item) => ({ ...item, method: item.method || "现金", office: item.source_type === "office-transfer" ? true : Boolean(item.office) })) : [],
    materials: Array.isArray(snapshot.materials) ? snapshot.materials.map((item) => ({ ...item, supplier_id: resolveSupplierId(suppliers, { supplierId: item.supplier_id, supplierName: item.supplier }) })) : [],
    purchases: Array.isArray(snapshot.purchases) ? snapshot.purchases.map((item) => ({ ...item, supplier_id: resolveSupplierId(suppliers, { supplierId: item.supplier_id, supplierName: item.supplier }) })) : [],
    employees: Array.isArray(snapshot.employees) ? snapshot.employees : [],
    attendances: Array.isArray(snapshot.attendances) ? snapshot.attendances : [],
    appointments, payrolls: Array.isArray(snapshot.payrolls) ? snapshot.payrolls : [],
    quotes, showcases: Array.isArray(snapshot.showcases) ? snapshot.showcases : [],
    printArchives: Array.isArray(snapshot.printArchives) ? snapshot.printArchives : [],
    settings: settings && typeof settings === "object" ? settings : {} as BizSettings,
  };
}

// ─── MySQL read ───────────────────────────────────────────────────────────────

async function mysqlRead(): Promise<BizStoreSnapshot> {
  const { queryRows } = await import("@/lib/db-mysql");
  const { rowToSettings } = await import("@/lib/db-mysql");

  // Read all tables in parallel
  const [
    orderRows, clientRows, supplierRows, expenseRows, cashRows,
    materialRows, purchaseRows, employeeRows, attendanceRows,
    appointmentRows, payrollRows, quoteRows, showcaseRows, printRows, settingsRows
  ] = await Promise.all([
    queryRows("SELECT * FROM a3s_orders"),
    queryRows("SELECT * FROM a3s_clients"),
    // Suppliers are stored as roles in a3s_clients
    queryRows("SELECT id, name, category, contact_person, phone, email, website, address, last_purchase_date, remark, master_id, roles, updated_at FROM a3s_clients WHERE roles LIKE '%供应商%'"),
    queryRows("SELECT * FROM a3s_expenses"),
    queryRows("SELECT * FROM a3s_cash_entries"),
    queryRows("SELECT * FROM a3s_materials"),
    queryRows("SELECT * FROM a3s_purchases"),
    queryRows("SELECT * FROM a3s_employees"),
    // Consolidated per employee+date (T1300 stored one-event-per-row)
    queryRows("SELECT CONCAT('ATT-', REPLACE(date, '-', ''), '-', COALESCE(NULLIF(employee_code,\"\"), employee_id)) as id, date, employee_id, employee_name, employee_code, SUM(worked_minutes) as worked_minutes, SUM(leave_minutes) as leave_minutes, SUM(overtime_minutes) as overtime_minutes, MAX(meal_allowance) as meal_allowance, MAX(generated_by) as generated_by, GROUP_CONCAT(DISTINCT note SEPARATOR '; ') as note FROM a3s_attendances GROUP BY date, employee_id, employee_name, employee_code"),
    queryRows("SELECT * FROM a3s_appointments"),
    queryRows("SELECT * FROM a3s_payrolls"),
    queryRows("SELECT * FROM a3s_quotes"),
    queryRows("SELECT * FROM a3s_showcases"),
    queryRows("SELECT * FROM a3s_print_archives"),
    queryRows("SELECT * FROM a3s_settings WHERE id = 1"),
  ]);

  const orders = orderRows.map(rowToOrder);
  const settings = rowToSettings(settingsRows[0] as Record<string, unknown>) ?? {} as BizSettings;

  // 自动考勤：当天没跑就补
  await autoFillAttendance(settings);

  return normalizeSnapshot({
    revision: createStoreRevision(),
    orders,
    clients: clientRows.map(rowToClient),
    suppliers: supplierRows.map(rowToSupplier),
    expenses: expenseRows.map(rowToExpense),
    cashEntries: cashRows.map(rowToCashEntry),
    materials: materialRows.map(rowToMaterial),
    purchases: purchaseRows.map(rowToPurchase),
    employees: employeeRows.map(rowToEmployee),
    attendances: attendanceRows.map(rowToAttendance),
    appointments: appointmentRows.map(rowToAppointment),
    payrolls: payrollRows.map(rowToPayroll),
    quotes: quoteRows.map(rowToQuote),
    showcases: showcaseRows.map(rowToShowcase),
    printArchives: printRows.map(rowToPrintArchive),
    settings,
  });
}

// ─── MySQL write ──────────────────────────────────────────────────────────────

async function mysqlWrite(snapshot: BizStoreSnapshot): Promise<void> {
  const { executeStmt, queryRows } = await import("@/lib/db-mysql");

  // Settings
  const s = snapshot.settings;
  await executeStmt(
    `INSERT INTO a3s_settings(id,company_name,company_name_zh,address,
      phone,phones,email,website,tax_number,default_tax_rate,default_currency,
      fiscal_start_month,bank_account,alipay,wechat_pay,other_payment,
      invoice_title,picking_title,zelle,invoice_note,quote_valid_days,
      quote_footer,logo_url,expense_types,supplier_categories,meal_allowance_amount,
      auto_attendance_timezone,auto_attendance_run_time,auto_attendance_default_minutes,
      auto_attendance_note,work_start,work_end,break_start,break_end,material_categories,income_categories)
    VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      company_name=VALUES(company_name),company_name_zh=VALUES(company_name_zh),
      address=VALUES(address),
      phone=VALUES(phone),phones=VALUES(phones),email=VALUES(email),
      website=VALUES(website),tax_number=VALUES(tax_number),
      default_tax_rate=VALUES(default_tax_rate),default_currency=VALUES(default_currency),
      fiscal_start_month=VALUES(fiscal_start_month),bank_account=VALUES(bank_account),
      alipay=VALUES(alipay),wechat_pay=VALUES(wechat_pay),
      other_payment=VALUES(other_payment),invoice_title=VALUES(invoice_title),
      picking_title=VALUES(picking_title),zelle=VALUES(zelle),
      invoice_note=VALUES(invoice_note),quote_valid_days=VALUES(quote_valid_days),
      quote_footer=VALUES(quote_footer),logo_url=VALUES(logo_url),
      expense_types=VALUES(expense_types),supplier_categories=VALUES(supplier_categories),
      meal_allowance_amount=VALUES(meal_allowance_amount),
      auto_attendance_timezone=VALUES(auto_attendance_timezone),
      auto_attendance_run_time=VALUES(auto_attendance_run_time),
      auto_attendance_default_minutes=VALUES(auto_attendance_default_minutes),
      auto_attendance_note=VALUES(auto_attendance_note),
      work_start=VALUES(work_start),work_end=VALUES(work_end),
      break_start=VALUES(break_start),break_end=VALUES(break_end),
      material_categories=VALUES(material_categories),income_categories=VALUES(income_categories)`,
    [s.company_name, s.company_name_zh ?? null, s.address,
      s.phone, s.phones ?? null, s.email, s.website, s.tax_number,
      s.default_tax_rate, s.default_currency, s.fiscal_start_month,
      s.bank_account, s.alipay, s.wechat_pay, s.other_payment,
      s.invoice_title ?? null, s.picking_title ?? null, s.zelle ?? null,
      s.invoice_note ?? null, s.quote_valid_days, s.quote_footer, s.logo_url,
      s.expense_types ?? null, s.supplier_categories ?? null,
      s.meal_allowance_amount ?? 8,
      s.auto_attendance_timezone ?? "America/New_York",
      s.auto_attendance_run_time ?? "01:00",
      s.auto_attendance_default_minutes ?? 600,
      s.auto_attendance_note ?? "",
      s.work_start ?? null, s.work_end ?? null,
      s.break_start ?? null, s.break_end ?? null,
      s.material_categories ?? null,
      s.income_categories ?? null]
  );

  // Helper: batch upsert
  async function batchUpsert(table: string, rows: Record<string, unknown>[], keyCol: string) {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = rows.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const updateSet = cols.filter(c => c !== keyCol).map(c => `${c}=VALUES(${c})`).join(',');
    const values = rows.flatMap(r => cols.map(c => r[c] ?? null));
    try {
      await executeStmt(
        `INSERT INTO ${table}(${cols.join(',')}) VALUES${placeholders} ON DUPLICATE KEY UPDATE ${updateSet}`,
        values
      );
    } catch (err) {
      console.error(`[mysqlWrite] batch upsert ${table} failed:`, err);
    }
  }

  // Orders
  await batchUpsert('a3s_orders', snapshot.orders.map(o => ({
    order_number: o.order_number, order_type: o.order_type || '定制单',
    client_name: o.client_name || '', client_id: o.client_id || null,
    phone: o.phone || null, address: o.address || null,
    preview_image: o.preview_image || null, description: o.description || null,
    total_price: o.total_price ?? 0, tax_rate: o.tax_rate ?? 0,
    discount: o.discount ?? 0, total_after_tax: o.total_after_tax ?? 0,
    amount_paid: o.amount_paid ?? 0, balance: o.balance ?? 0,
    order_date: o.order_date || null, status: o.status || '下单',
    operation_type: o.operation_type || null, install_info: o.install_info || null,
    installers: o.installers || null, remarks: o.remarks || null,
    payment_history: JSON.stringify(o.payment_history || []),
    material_rows: JSON.stringify(o.material_rows || []),
  })), 'order_number');

  // Clients
  await batchUpsert('a3s_clients', snapshot.clients.map(c => ({
    id: c.id, name: c.name || '', contact: c.contact || null,
    phone: c.phone || null, email: c.email || null, website: c.website || null,
    address: c.address || null,
    created_at: c.created_at || null, note: c.note || null, remark: c.remark || null,
    is_vip: c.is_vip ? 1 : 0, balance: c.balance ?? 0, wechat: c.wechat || null,
    roles: c.roles?.length ? JSON.stringify(c.roles) : null,
    master_id: c.master_id || null,
    category: c.category || null, contact_person: c.contact_person || null,
    last_purchase_date: c.last_purchase_date || null,
  })), 'id');

  // Suppliers: write only supplier-specific fields.
  // Never overwrite shared fields (name, contact, balance, is_vip, wechat, roles).
  if (snapshot.suppliers.length) {
    await batchUpsert('a3s_clients', snapshot.suppliers.map(s => ({
      id: s.id,
      category: s.category || null,
      contact_person: s.contact_person || null,
      phone: s.phone || null,
      email: s.email || null,
      website: s.website || null,
      address: s.address || null,
      last_purchase_date: s.last_purchase_date || null,
      remark: s.remark || null,
      master_id: s.master_id || null,
    })), 'id');
  }

  // Expenses
  await batchUpsert('a3s_expenses', snapshot.expenses.map(e => ({
    id: e.id, target: e.target || '', detail: e.detail || '',
    amount: e.amount ?? 0, expense_type: e.expense_type || '',
    payment_method: e.payment_method || '现金', expense_date: e.expense_date || '',
    remark: e.remark || null, office: e.office ? 1 : 0,
    source_type: e.source_type || null, source_id: e.source_id || null,
    order_id: e.order_id || null, voided: e.voided ? 1 : 0,
  })), 'id');

  // Cash entries
  await batchUpsert('a3s_cash_entries', snapshot.cashEntries.map(c => ({
    id: c.id, type: c.type || '收入', amount: c.amount ?? 0,
    date: c.date || '', note: c.note || null,
    method: c.method || '现金', category: c.category || null, target_name: c.target_name || null, office: c.office ? 1 : 0,
    order_number: c.order_number || null,
    source_type: c.source_type || null, source_id: c.source_id || null,
    order_id: c.order_id || null, voided: c.voided ? 1 : 0,
  })), 'id');

  // Materials
  await batchUpsert('a3s_materials', snapshot.materials.map(m => ({
    id: m.id, code: m.code || '', name: m.name || '',
    specification: m.specification || null, size: m.size || null,
    unit: m.unit || '个', stock_quantity: m.stock_quantity ?? 0,
    min_stock: m.min_stock ?? 0, factory_price_rmb: m.factory_price_rmb ?? 0,
    usd_cost: m.usd_cost ?? 0, sale_price_usd: m.sale_price_usd ?? 0,
    vip_sale_price_usd: m.vip_sale_price_usd ?? null, weight: m.weight ?? null,
    purchase_price: m.purchase_price ?? 0, supplier: m.supplier || null,
    supplier_id: m.supplier_id || null, image: m.image || null,
    last_stock_date: m.last_stock_date || null, remark: m.remark || null,
    category: m.category || null,
  })), 'id');

  // Purchases
  if (snapshot.purchases?.length) {
    await batchUpsert('a3s_purchases', snapshot.purchases.map(p => ({
      id: p.id, supplier: p.supplier || '', supplier_id: p.supplier_id || null,
      item_name: p.item_name || '', quantity: p.quantity ?? 0,
      unit: p.unit || '个', unit_price: p.unit_price ?? 0,
      total_amount: p.total_amount ?? 0, purchase_date: p.purchase_date || '',
      status: p.status || '待收货', expense_id: p.expense_id || null,
      group_id: p.group_id || null, material_id: p.material_id || null,
      notes: p.notes || null,
    })), 'id');
  }

  // Employees
  await batchUpsert('a3s_employees', snapshot.employees.map(e => ({
    id: e.id, code: e.code || null, name: e.name || '',
    position: e.position || null, phone: e.phone || null,
    hire_date: e.hire_date || null, contract_end: e.contract_end || null,
    monthly_salary: e.monthly_salary ?? 0, hourly_rate: e.hourly_rate ?? null,
    workdays: e.workdays?.length ? JSON.stringify(e.workdays) : null,
    meal_allowance_eligible: e.meal_allowance_eligible == null ? null : (e.meal_allowance_eligible ? 1 : 0),
    ethnicity: e.ethnicity || null, status: e.status || '在职',
  })), 'id');

  // Attendances
  if (snapshot.attendances.length) {
    const attRows = snapshot.attendances.map(a => ({
      id: a.id, date: a.date || '', employee_id: a.employee_id || null,
      employee_name: a.employee_name || '', employee_code: a.employee_code || null,
      leave_minutes: a.leave_minutes ?? 0, overtime_minutes: a.overtime_minutes ?? 0,
      worked_minutes: a.worked_minutes ?? 0, meal_allowance: a.meal_allowance ? 1 : 0,
      generated_by: a.generated_by || null, note: a.note || null,
    }));
    // Batch write in chunks to avoid query size limits
    for (let i = 0; i < attRows.length; i += 500) {
      await batchUpsert('a3s_attendances', attRows.slice(i, i + 500), 'id');
    }
  }

  // Appointments
  if (snapshot.appointments?.length) {
    await batchUpsert('a3s_appointments', snapshot.appointments.map(a => ({
      id: a.id, client_name: a.client_name || '', client_id: a.client_id || null,
      phone: a.phone || null, address: a.address || null,
      appointment_date: a.appointment_date || '',
      description: a.description || null, gcal_event_id: a.gcal_event_id || null,
    })), 'id');
  }

  // Payrolls
  if (snapshot.payrolls?.length) {
    await batchUpsert('a3s_payrolls', snapshot.payrolls.map(p => ({
      id: p.id, month: p.month || '', employee_id: p.employee_id || null,
      employee_name: p.employee_name || '', employee_code: p.employee_code || null,
      employee_ethnicity: p.employee_ethnicity || null,
      total_hours: p.total_hours ?? null, hourly_rate: p.hourly_rate ?? null,
      meal_allowance_total: p.meal_allowance_total ?? null,
      base_salary: p.base_salary ?? 0, bonus: p.bonus ?? 0,
      deduction: p.deduction ?? 0, net_salary: p.net_salary ?? 0,
      payment_status: p.payment_status || '未支付', paid_at: p.paid_at || null,
      expense_id: p.expense_id || null,
    })), 'id');
  }

  // Quotes
  if (snapshot.quotes?.length) {
    await batchUpsert('a3s_quotes', snapshot.quotes.map(q => ({
      id: q.id, client_name: q.client_name || '', client_id: q.client_id || null,
      title: q.title || '', amount: q.amount ?? 0,
      created_at: q.created_at || '', valid_until: q.valid_until || '',
      status: q.status || '待确认',
    })), 'id');
  }

  // Showcases
  if (snapshot.showcases?.length) {
    await batchUpsert('a3s_showcases', snapshot.showcases.map(s => ({
      id: s.id, name: s.name || '', category: s.category || '',
      image_count: s.image_count ?? 0, description: s.description || null,
      created_at: s.created_at || '', status: s.status || '展示中',
    })), 'id');
  }

  // Print archives
  if (snapshot.printArchives?.length) {
    await batchUpsert('a3s_print_archives', snapshot.printArchives.map(p => ({
      id: p.id, order_number: p.order_number || '', client_name: p.client_name || '',
      order_type: p.order_type || '', print_type: p.print_type || 'invoice',
      title: p.title || '', created_at: p.created_at || '',
      created_by: p.created_by || null, amount: p.amount ?? null,
      file_name: p.file_name || '', html: p.html || '',
      summary: p.summary || null,
    })), 'id');
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToOrder(r: Record<string, unknown>): BizOrder {
  return {
    order_number: String(r.order_number ?? ""),
    order_type: String(r.order_type ?? "定制单"),
    client_name: String(r.client_name ?? ""),
    client_id: val(r.client_id, undefined),
    phone: val(r.phone, undefined),
    address: val(r.address, undefined),
    preview_image: val(r.preview_image, undefined),
    description: val(r.description, undefined),
    total_price: Number(r.total_price ?? 0),
    tax_rate: Number(r.tax_rate ?? 0),
    discount: Number(r.discount ?? 0),
    total_after_tax: Number(r.total_after_tax ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    balance: Number(r.balance ?? 0),
    order_date: val(r.order_date, undefined),
    status: String(r.status ?? "下单"),
    operation_type: val(r.operation_type, undefined),
    install_info: val(r.install_info, undefined),
    installers: val(r.installers, undefined),
    remarks: val(r.remarks, undefined),
    payment_history: parseJson(r.payment_history, []),
    material_rows: parseJson(r.material_rows, []),
  };
}

function rowToClient(r: Record<string, unknown>): ContactRecord {
  return {
    id: String(r.id), name: String(r.name),
    contact: nullStr(r.contact) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    email: nullStr(r.email) ?? undefined,
    website: nullStr(r.website) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    created_at: nullStr(r.created_at) ?? undefined,
    note: nullStr(r.note) ?? undefined,
    remark: nullStr(r.remark) ?? undefined,
    is_vip: Boolean(r.is_vip),
    balance: Number(r.balance ?? 0),
    wechat: nullStr(r.wechat) ?? undefined,
    category: nullStr(r.category) ?? undefined,
    contact_person: nullStr(r.contact_person) ?? undefined,
    last_purchase_date: nullStr(r.last_purchase_date) ?? undefined,
    roles: (() => { try { const v = r.roles; if (Array.isArray(v)) return v as Array<"客户" | "供应商">; if (typeof v === 'string' && v) return JSON.parse(v) as Array<"客户" | "供应商">; } catch {} return undefined; })(),
    master_id: nullStr(r.master_id) ?? undefined,
  };
}

function rowToSupplier(r: Record<string, unknown>): SupplierRecord {
  return {
    id: String(r.id), name: String(r.name),
    category: nullStr(r.category) ?? undefined,
    contact_person: nullStr(r.contact_person) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    email: nullStr(r.email) ?? undefined,
    website: nullStr(r.website) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    last_purchase_date: nullStr(r.last_purchase_date) ?? undefined,
    remark: nullStr(r.remark) ?? undefined,
    master_id: nullStr(r.master_id) ?? undefined,
    roles: (() => { try { const v = r.roles; if (Array.isArray(v)) return v as Array<"客户" | "供应商">; if (typeof v === 'string' && v) return JSON.parse(v) as Array<"客户" | "供应商">; } catch {} return undefined; })(),
  };
}

function rowToExpense(r: Record<string, unknown>): ExpenseRecord {
  return {
    id: String(r.id), target: String(r.target), detail: String(r.detail),
    amount: Number(r.amount ?? 0), expense_type: String(r.expense_type),
    payment_method: String(r.payment_method), expense_date: String(r.expense_date),
    remark: nullStr(r.remark) ?? undefined,
    office: Boolean(r.office),
    source_type: nullStr(r.source_type) ?? undefined,
    source_id: nullStr(r.source_id) ?? undefined,
    order_id: nullStr(r.order_id) ?? undefined,
    voided: Boolean(r.voided),
  };
}

function rowToCashEntry(r: Record<string, unknown>): CashEntry {
  return {
    id: String(r.id), type: String(r.type),
    amount: Number(r.amount ?? 0), date: String(r.date),
    note: nullStr(r.note) ?? undefined,
    method: nullStr(r.method) ?? undefined,
    category: nullStr(r.category) ?? undefined,
    target_name: nullStr(r.target_name) ?? undefined,
    office: Boolean(r.office),
    order_number: nullStr(r.order_number) ?? undefined,
    source_type: nullStr(r.source_type) ?? undefined,
    source_id: nullStr(r.source_id) ?? undefined,
    order_id: nullStr(r.order_id) ?? undefined,
    voided: Boolean(r.voided),
  };
}

function rowToMaterial(r: Record<string, unknown>): MaterialRecord {
  return {
    id: String(r.id), code: String(r.code ?? ""), name: String(r.name),
    specification: nullStr(r.specification) ?? undefined,
    size: nullStr(r.size) ?? undefined,
    unit: String(r.unit ?? "个"),
    stock_quantity: Number(r.stock_quantity ?? 0),
    min_stock: Number(r.min_stock ?? 0),
    factory_price_rmb: Number(r.factory_price_rmb ?? 0),
    usd_cost: Number(r.usd_cost ?? 0),
    sale_price_usd: Number(r.sale_price_usd ?? 0),
    vip_sale_price_usd: r.vip_sale_price_usd == null ? undefined : Number(r.vip_sale_price_usd),
    weight: r.weight == null ? undefined : Number(r.weight),
    purchase_price: Number(r.purchase_price ?? 0),
    supplier: nullStr(r.supplier) ?? undefined,
    supplier_id: nullStr(r.supplier_id) ?? undefined,
    image: nullStr(r.image) ?? undefined,
    last_stock_date: nullStr(r.last_stock_date) ?? undefined,
    remark: nullStr(r.remark) ?? undefined,
    category: nullStr(r.category) ?? undefined,
  };
}

function rowToPurchase(r: Record<string, unknown>): PurchaseRecord {
  return {
    id: String(r.id), supplier: String(r.supplier),
    supplier_id: nullStr(r.supplier_id) ?? undefined,
    item_name: String(r.item_name), quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? "个"), unit_price: Number(r.unit_price ?? 0),
    total_amount: Number(r.total_amount ?? 0), purchase_date: String(r.purchase_date),
    status: String(r.status),
    expense_id: nullStr(r.expense_id) ?? undefined,
    group_id: nullStr(r.group_id) ?? undefined,
    material_id: nullStr(r.material_id) ?? undefined,
    notes: nullStr(r.notes) ?? undefined,
  };
}

function rowToEmployee(r: Record<string, unknown>): EmployeeRecord {
  return {
    id: String(r.id), code: nullStr(r.code) ?? undefined, name: String(r.name),
    position: nullStr(r.position) ?? undefined, phone: nullStr(r.phone) ?? undefined,
    hire_date: nullStr(r.hire_date) ?? undefined,
    contract_end: nullStr(r.contract_end) ?? undefined,
    monthly_salary: Number(r.monthly_salary ?? 0),
    hourly_rate: r.hourly_rate == null ? undefined : Number(r.hourly_rate),
    workdays: parseJson(r.workdays, undefined),
    meal_allowance_eligible: r.meal_allowance_eligible == null ? undefined : Boolean(r.meal_allowance_eligible),
    ethnicity: nullStr(r.ethnicity) ?? undefined,
    status: String(r.status ?? "在职"),
  };
}

function rowToAttendance(r: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(r.id), date: String(r.date),
    employee_id: nullStr(r.employee_id) ?? undefined,
    employee_name: String(r.employee_name),
    employee_code: nullStr(r.employee_code) ?? undefined,
    leave_minutes: Number(r.leave_minutes ?? 0),
    overtime_minutes: Number(r.overtime_minutes ?? 0),
    worked_minutes: Number(r.worked_minutes ?? 0),
    meal_allowance: Boolean(r.meal_allowance),
    generated_by: nullStr(r.generated_by) ?? undefined,
    note: nullStr(r.note) ?? undefined,
  };
}

function rowToAppointment(r: Record<string, unknown>): MeasurementAppointmentRecord {
  return {
    id: String(r.id), client_name: String(r.client_name),
    client_id: nullStr(r.client_id) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    appointment_date: String(r.appointment_date),
    appointment_time: nullStr(r.appointment_time) ?? undefined,
    description: nullStr(r.description) ?? undefined,
    gcal_event_id: nullStr(r.gcal_event_id) ?? undefined,
  };
}

function rowToPayroll(r: Record<string, unknown>): PayrollRecord {
  return {
    id: String(r.id), month: String(r.month),
    employee_id: nullStr(r.employee_id) ?? undefined,
    employee_name: String(r.employee_name),
    employee_code: nullStr(r.employee_code) ?? undefined,
    employee_ethnicity: nullStr(r.employee_ethnicity) ?? undefined,
    total_hours: r.total_hours == null ? undefined : Number(r.total_hours),
    hourly_rate: r.hourly_rate == null ? undefined : Number(r.hourly_rate),
    meal_allowance_total: r.meal_allowance_total == null ? undefined : Number(r.meal_allowance_total),
    base_salary: Number(r.base_salary ?? 0),
    bonus: Number(r.bonus ?? 0), deduction: Number(r.deduction ?? 0),
    net_salary: Number(r.net_salary ?? 0),
    payment_status: String(r.payment_status ?? "未支付"),
    paid_at: nullStr(r.paid_at) ?? undefined,
    expense_id: nullStr(r.expense_id) ?? undefined,
  };
}

function rowToQuote(r: Record<string, unknown>): QuoteRecord {
  return {
    id: String(r.id), client_name: String(r.client_name),
    client_id: nullStr(r.client_id) ?? undefined,
    title: String(r.title), amount: Number(r.amount ?? 0),
    created_at: String(r.created_at), valid_until: String(r.valid_until),
    status: String(r.status ?? "待确认"),
  };
}

function rowToShowcase(r: Record<string, unknown>): ShowcaseRecord {
  return {
    id: String(r.id), name: String(r.name), category: String(r.category),
    image_count: Number(r.image_count ?? 0),
    description: nullStr(r.description) ?? undefined,
    created_at: String(r.created_at), status: String(r.status ?? "展示中"),
  };
}

function rowToPrintArchive(r: Record<string, unknown>): PrintArchiveRecord {
  return {
    id: String(r.id), order_number: String(r.order_number),
    client_name: String(r.client_name), order_type: String(r.order_type),
    print_type: String(r.print_type ?? "invoice"),
    title: String(r.title), created_at: String(r.created_at),
    created_by: nullStr(r.created_by) ?? undefined,
    amount: r.amount == null ? undefined : Number(r.amount),
    file_name: String(r.file_name), html: String(r.html),
    summary: nullStr(r.summary) ?? undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _cached: { ts: number; snapshot: BizStoreSnapshot } | null = null;
const CACHE_TTL = 25_000;

export async function readBizStore(): Promise<BizStoreSnapshot> {
  const now = Date.now();
  if (_cached && now - _cached.ts < CACHE_TTL) {
    return _cached.snapshot;
  }

  const snapshot = await mysqlRead();
  _cached = { ts: now, snapshot };
  return snapshot;
}

export async function writeBizStore(snapshot: BizStoreSnapshot): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);
  await mysqlWrite(normalized);
  _cached = null; // 写后清缓存，下次读一定是新的
}

export function invalidateBizStoreCache(): void {
  _cached = null;
}

export async function deleteBizClient(id: string): Promise<void> {
  const { executeStmt } = await import("@/lib/db-mysql");
  await executeStmt("DELETE FROM a3s_clients WHERE id=?", [id]);
}

export async function deleteBizSupplier(id: string): Promise<void> {
  const { executeStmt } = await import("@/lib/db-mysql");
  await executeStmt("DELETE FROM a3s_clients WHERE id=?", [id]);
}

// ── 自动考勤 ──────────────────────────────────────────
// 每天第一次访问 biz-store 时触发，为在职员工补当天考勤

let _attendanceDate = "";

async function autoFillAttendance(settings: BizSettings): Promise<void> {
  try {
    const tz = settings.auto_attendance_timezone || "America/New_York";
    const defMin = settings.auto_attendance_default_minutes || 600;
    const note = settings.auto_attendance_note || "";
    const runTime = settings.auto_attendance_run_time || "";
    if (!runTime) return;

    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: tz });
    const curTime = now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

    if (_attendanceDate === today) return;
    if (curTime < runTime) return;
    _attendanceDate = today;

    const { queryRows, executeStmt } = await import("@/lib/db-mysql");
    const emps = await queryRows("SELECT id, code, name, workdays FROM a3s_employees WHERE status = '在职'");
    const todayId = today.replace(/-/g, "");

    // 今天星期几 (0=日, 1=一...6=六)
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dow = dayNames[new Date(today + "T12:00:00").getDay()]; // 中午12点避免时区问题

    for (const e of emps) {
      const eid = String(e.id);
      const code = String(e.code || "");
      const name = String(e.name || "");

      // 检查今天是否是该员工的工作日
      const workdays = String(e.workdays || "");
      if (workdays && !workdays.includes(dow)) continue;

      const exist = await queryRows(
        "SELECT id FROM a3s_attendances WHERE employee_id = ? AND date = ? LIMIT 1",
        [eid, today]
      );
      if (exist.length > 0) continue;

      await executeStmt(
        "INSERT INTO a3s_attendances (id, date, employee_id, employee_name, employee_code, worked_minutes, leave_minutes, overtime_minutes, meal_allowance, generated_by, note) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'auto', ?)",
        [`ATT-${todayId}-${code || eid}`, today, eid, name, code || null, defMin, note || null]
      );
    }
  } catch {
    // 静默，不影响页面
  }
}

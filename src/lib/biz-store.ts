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
  orders: BizOrder[];
  clients: ContactRecord[];
  suppliers: SupplierRecord[];
  expenses: ExpenseRecord[];
  cashEntries: CashEntry[];
  materials: MaterialRecord[];
  purchases: PurchaseRecord[];
  employees: EmployeeRecord[];
  attendances: AttendanceRecord[];
  appointments: MeasurementAppointmentRecord[];
  payrolls: PayrollRecord[];
  quotes: QuoteRecord[];
  showcases: ShowcaseRecord[];
  printArchives: PrintArchiveRecord[];
  settings: BizSettings;
};

// ─── Storage backend: SQLite (local) | Redis (Vercel) ────────────────────────

// Lazily import backend modules — client-side bundles won't resolve them anyway
async function getStore(): Promise<"sqlite" | "redis"> {
  if (typeof window !== "undefined") return "redis"; // client side, never call
  if (process.env.VERCEL) return "redis";
  return "sqlite";
}

// ─── SQLite implementation ─────────────────────────────────────────────────────

function val<T>(v: unknown, fallback: T): T {
  return (v == null || v === undefined) ? fallback : v as T;
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v as T ?? fallback;
}

function rowToOrder(r: Record<string, unknown>): BizOrder {
  return {
    order_number: String(r.order_number ?? ""),
    order_type: String(r.order_type ?? "定制单"),
    client_name: String(r.client_name ?? ""),
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
    remarks: val(r.remarks, undefined),
    payment_history: parseJson(r.payment_history, []),
    material_rows: parseJson(r.material_rows, []),
  };
}

function orderToRow(o: BizOrder): Record<string, unknown> {
  return {
    order_number: o.order_number,
    order_type: o.order_type,
    client_name: o.client_name,
    phone: o.phone ?? null,
    address: o.address ?? null,
    preview_image: o.preview_image ?? null,
    description: o.description ?? null,
    total_price: o.total_price ?? 0,
    tax_rate: o.tax_rate ?? 0,
    discount: o.discount ?? 0,
    total_after_tax: o.total_after_tax ?? 0,
    amount_paid: o.amount_paid ?? 0,
    balance: o.balance ?? 0,
    order_date: o.order_date ?? null,
    status: o.status ?? "下单",
    operation_type: o.operation_type ?? null,
    install_info: o.install_info ?? null,
    remarks: o.remarks ?? null,
    payment_history: JSON.stringify(o.payment_history ?? []),
    material_rows: JSON.stringify(o.material_rows ?? []),
    updated_at: new Date().toISOString(),
  };
}

function nullStr(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

const SQLITE_TABLES = [
  "orders", "clients", "suppliers", "expenses", "cash_entries",
  "materials", "purchases", "employees", "attendances", "appointments",
  "payrolls", "quotes", "showcases", "print_archives",
] as const;

async function sqliteRead(): Promise<BizStoreSnapshot> {
  const { getDb, rowToSettings } = await import("@/lib/db");
  const db = getDb();

  const orders = (db.prepare("SELECT * FROM orders").all() as Record<string, unknown>[]).map(rowToOrder);
  const clients = db.prepare("SELECT * FROM clients").all().map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    contact: nullStr(r.contact) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    email: nullStr(r.email) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    created_at: nullStr(r.created_at) ?? undefined,
    note: nullStr(r.note) ?? undefined,
    is_vip: Boolean(r.is_vip),
    balance: Number(r.balance ?? 0),
    wechat: nullStr(r.wechat) ?? undefined,
  }));

  const suppliers = db.prepare("SELECT * FROM suppliers").all().map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    category: nullStr(r.category) ?? undefined,
    contact_person: nullStr(r.contact_person) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    email: nullStr(r.email) ?? undefined,
    website: nullStr(r.website) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    last_purchase_date: nullStr(r.last_purchase_date) ?? undefined,
    remark: nullStr(r.remark) ?? undefined,
  }));

  const expenses = db.prepare("SELECT * FROM expenses").all().map((r: any) => ({
    id: String(r.id),
    target: String(r.target),
    detail: String(r.detail),
    amount: Number(r.amount ?? 0),
    expense_type: String(r.expense_type),
    payment_method: String(r.payment_method),
    expense_date: String(r.expense_date),
    remark: nullStr(r.remark) ?? undefined,
    office: Boolean(r.office),
  }));

  const cashEntries = db.prepare("SELECT * FROM cash_entries").all().map((r: any) => ({
    id: String(r.id),
    type: String(r.type),
    amount: Number(r.amount ?? 0),
    date: String(r.date),
    note: nullStr(r.note) ?? undefined,
  }));

  const materials = db.prepare("SELECT * FROM materials").all().map((r: any) => ({
    id: String(r.id),
    code: String(r.code ?? ""),
    name: String(r.name),
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
    image: nullStr(r.image) ?? undefined,
    last_stock_date: nullStr(r.last_stock_date) ?? undefined,
    remark: nullStr(r.remark) ?? undefined,
  }));

  const purchases = db.prepare("SELECT * FROM purchases").all().map((r: any) => ({
    id: String(r.id),
    supplier: String(r.supplier),
    item_name: String(r.item_name),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? "个"),
    unit_price: Number(r.unit_price ?? 0),
    total_amount: Number(r.total_amount ?? 0),
    purchase_date: String(r.purchase_date),
    status: String(r.status),
    expense_id: nullStr(r.expense_id) ?? undefined,
  }));

  const employees = db.prepare("SELECT * FROM employees").all().map((r: any) => ({
    id: String(r.id),
    code: nullStr(r.code) ?? undefined,
    name: String(r.name),
    position: nullStr(r.position) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    hire_date: nullStr(r.hire_date) ?? undefined,
    contract_end: nullStr(r.contract_end) ?? undefined,
    monthly_salary: Number(r.monthly_salary ?? 0),
    hourly_rate: r.hourly_rate == null ? undefined : Number(r.hourly_rate),
    workdays: parseJson(r.workdays, undefined),
    meal_allowance_eligible: r.meal_allowance_eligible == null ? undefined : Boolean(r.meal_allowance_eligible),
    ethnicity: nullStr(r.ethnicity) ?? undefined,
    status: String(r.status ?? "在职"),
  }));

  const attendances = db.prepare("SELECT * FROM attendances").all().map((r: any) => ({
    id: String(r.id),
    date: String(r.date),
    employee_id: nullStr(r.employee_id) ?? undefined,
    employee_name: String(r.employee_name),
    employee_code: nullStr(r.employee_code) ?? undefined,
    leave_minutes: Number(r.leave_minutes ?? 0),
    overtime_minutes: Number(r.overtime_minutes ?? 0),
    worked_minutes: Number(r.worked_minutes ?? 0),
    meal_allowance: Boolean(r.meal_allowance),
    generated_by: nullStr(r.generated_by) ?? undefined,
    note: nullStr(r.note) ?? undefined,
  }));

  const appointments = db.prepare("SELECT * FROM appointments").all().map((r: any) => ({
    id: String(r.id),
    client_name: String(r.client_name),
    client_id: nullStr(r.client_id) ?? undefined,
    phone: nullStr(r.phone) ?? undefined,
    address: nullStr(r.address) ?? undefined,
    appointment_date: String(r.appointment_date),
    description: nullStr(r.description) ?? undefined,
    gcal_event_id: nullStr(r.gcal_event_id) ?? undefined,
  }));

  const payrolls = db.prepare("SELECT * FROM payrolls").all().map((r: any) => ({
    id: String(r.id),
    month: String(r.month),
    employee_id: nullStr(r.employee_id) ?? undefined,
    employee_name: String(r.employee_name),
    employee_code: nullStr(r.employee_code) ?? undefined,
    employee_ethnicity: nullStr(r.employee_ethnicity) ?? undefined,
    total_hours: r.total_hours == null ? undefined : Number(r.total_hours),
    hourly_rate: r.hourly_rate == null ? undefined : Number(r.hourly_rate),
    meal_allowance_total: r.meal_allowance_total == null ? undefined : Number(r.meal_allowance_total),
    base_salary: Number(r.base_salary ?? 0),
    bonus: Number(r.bonus ?? 0),
    deduction: Number(r.deduction ?? 0),
    net_salary: Number(r.net_salary ?? 0),
    payment_status: String(r.payment_status ?? "未支付"),
    paid_at: nullStr(r.paid_at) ?? undefined,
    expense_id: nullStr(r.expense_id) ?? undefined,
  }));

  const quotes = db.prepare("SELECT * FROM quotes").all().map((r: any) => ({
    id: String(r.id),
    client_name: String(r.client_name),
    title: String(r.title),
    amount: Number(r.amount ?? 0),
    created_at: String(r.created_at),
    valid_until: String(r.valid_until),
    status: String(r.status ?? "待确认"),
  }));

  const showcases = db.prepare("SELECT * FROM showcases").all().map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    image_count: Number(r.image_count ?? 0),
    description: nullStr(r.description) ?? undefined,
    created_at: String(r.created_at),
    status: String(r.status ?? "展示中"),
  }));

  const printArchives = db.prepare("SELECT * FROM print_archives").all().map((r: any) => ({
    id: String(r.id),
    order_number: String(r.order_number),
    client_name: String(r.client_name),
    order_type: String(r.order_type),
    print_type: String(r.print_type ?? "invoice"),
    title: String(r.title),
    created_at: String(r.created_at),
    created_by: nullStr(r.created_by) ?? undefined,
    amount: r.amount == null ? undefined : Number(r.amount),
    file_name: String(r.file_name),
    html: String(r.html),
    summary: nullStr(r.summary) ?? undefined,
  }));

  const settingsRow = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  const settings: BizSettings = rowToSettings(settingsRow as Record<string, unknown> | undefined) ?? {
    company_name: "", address: "", phone: "", email: "", website: "",
    tax_number: "", default_tax_rate: 0, default_currency: "USD",
    fiscal_start_month: 1, bank_account: "", alipay: "", wechat_pay: "",
    other_payment: "", quote_valid_days: 30, quote_footer: "", logo_url: "",
  };

  // First time: seed from static JSON files if empty
  if (orders.length === 0 && clients.length === 0) {
    const seed = await buildSeedDefault();
    await sqliteWrite(seed);
    return sqliteRead(); // recurse once
  }

  return {
    orders, clients, suppliers, expenses, cashEntries,
    materials, purchases, employees, attendances, appointments,
    payrolls, quotes, showcases, printArchives, settings,
  };
}

async function sqliteWrite(snapshot: BizStoreSnapshot): Promise<void> {
  const { getDb, rowToSettings } = await import("@/lib/db");
  const db = getDb();

  const txn = db.transaction(() => {
    // Settings (single row, upsert)
    const s = snapshot.settings;
    db.prepare(`
      INSERT INTO settings (id, company_name, company_name_zh, address, company_address,
        phone, phones, email, website, tax_number, default_tax_rate, default_currency,
        fiscal_start_month, bank_account, alipay, wechat_pay, other_payment,
        invoice_title, picking_title, zelle, invoice_note, quote_valid_days,
        quote_footer, logo_url, expense_types, supplier_categories, meal_allowance_amount,
        auto_attendance_timezone, auto_attendance_run_time, auto_attendance_default_minutes,
        auto_attendance_note)
      VALUES (1,
        @company_name, @company_name_zh, @address, @company_address,
        @phone, @phones, @email, @website, @tax_number, @default_tax_rate, @default_currency,
        @fiscal_start_month, @bank_account, @alipay, @wechat_pay, @other_payment,
        @invoice_title, @picking_title, @zelle, @invoice_note, @quote_valid_days,
        @quote_footer, @logo_url, @expense_types, @supplier_categories, @meal_allowance_amount,
        @auto_attendance_timezone, @auto_attendance_run_time, @auto_attendance_default_minutes,
        @auto_attendance_note)
      ON CONFLICT(id) DO UPDATE SET
        company_name=@company_name, company_name_zh=@company_name_zh,
        address=@address, company_address=@company_address,
        phone=@phone, phones=@phones, email=@email, website=@website,
        tax_number=@tax_number, default_tax_rate=@default_tax_rate,
        default_currency=@default_currency, fiscal_start_month=@fiscal_start_month,
        bank_account=@bank_account, alipay=@alipay, wechat_pay=@wechat_pay,
        other_payment=@other_payment, invoice_title=@invoice_title,
        picking_title=@picking_title, zelle=@zelle, invoice_note=@invoice_note,
        quote_valid_days=@quote_valid_days, quote_footer=@quote_footer,
        logo_url=@logo_url, expense_types=@expense_types,
        supplier_categories=@supplier_categories,
        meal_allowance_amount=@meal_allowance_amount,
        auto_attendance_timezone=@auto_attendance_timezone,
        auto_attendance_run_time=@auto_attendance_run_time,
        auto_attendance_default_minutes=@auto_attendance_default_minutes,
        auto_attendance_note=@auto_attendance_note
    `).run({
      company_name: s.company_name,
      company_name_zh: s.company_name_zh ?? null,
      address: s.address,
      company_address: s.company_address ?? null,
      phone: s.phone,
      phones: s.phones ?? null,
      email: s.email,
      website: s.website,
      tax_number: s.tax_number,
      default_tax_rate: s.default_tax_rate,
      default_currency: s.default_currency,
      fiscal_start_month: s.fiscal_start_month,
      bank_account: s.bank_account,
      alipay: s.alipay,
      wechat_pay: s.wechat_pay,
      other_payment: s.other_payment,
      invoice_title: s.invoice_title ?? null,
      picking_title: s.picking_title ?? null,
      zelle: s.zelle ?? null,
      invoice_note: s.invoice_note ?? null,
      quote_valid_days: s.quote_valid_days,
      quote_footer: s.quote_footer,
      logo_url: s.logo_url,
      expense_types: s.expense_types ?? null,
      supplier_categories: s.supplier_categories ?? null,
      meal_allowance_amount: s.meal_allowance_amount ?? 15,
      auto_attendance_timezone: s.auto_attendance_timezone ?? "America/New_York",
      auto_attendance_run_time: s.auto_attendance_run_time ?? "01:00",
      auto_attendance_default_minutes: s.auto_attendance_default_minutes ?? 600,
      auto_attendance_note: s.auto_attendance_note ?? "",
    });

    // Orders: delete + insert
    db.prepare("DELETE FROM orders").run();
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_number, order_type, client_name, phone, address,
        preview_image, description, total_price, tax_rate, discount, total_after_tax,
        amount_paid, balance, order_date, status, operation_type, install_info, remarks,
        payment_history, material_rows, updated_at)
      VALUES (@order_number, @order_type, @client_name, @phone, @address,
        @preview_image, @description, @total_price, @tax_rate, @discount, @total_after_tax,
        @amount_paid, @balance, @order_date, @status, @operation_type, @install_info, @remarks,
        @payment_history, @material_rows, @updated_at)
    `);
    for (const o of snapshot.orders) insertOrder.run(orderToRow(o));

    // Clients
    db.prepare("DELETE FROM clients").run();
    const insertClient = db.prepare(`
      INSERT INTO clients (id, name, contact, phone, email, address, created_at, note, is_vip, balance, wechat, updated_at)
      VALUES (@id, @name, @contact, @phone, @email, @address, @created_at, @note, @is_vip, @balance, @wechat, @updated_at)
    `);
    for (const c of snapshot.clients) insertClient.run({
      id: c.id, name: c.name, contact: c.contact ?? null, phone: c.phone ?? null,
      email: c.email ?? null, address: c.address ?? null, created_at: c.created_at ?? null,
      note: c.note ?? null, is_vip: c.is_vip ? 1 : 0, balance: c.balance ?? 0,
      wechat: c.wechat ?? null, updated_at: new Date().toISOString(),
    });

    // Suppliers
    db.prepare("DELETE FROM suppliers").run();
    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (id, name, category, contact_person, phone, email, website, address, last_purchase_date, remark, updated_at)
      VALUES (@id, @name, @category, @contact_person, @phone, @email, @website, @address, @last_purchase_date, @remark, @updated_at)
    `);
    for (const s of snapshot.suppliers) insertSupplier.run({
      id: s.id, name: s.name, category: s.category ?? null, contact_person: s.contact_person ?? null,
      phone: s.phone ?? null, email: s.email ?? null, website: s.website ?? null,
      address: s.address ?? null, last_purchase_date: s.last_purchase_date ?? null,
      remark: s.remark ?? null, updated_at: new Date().toISOString(),
    });

    // Expenses
    db.prepare("DELETE FROM expenses").run();
    const insertExpense = db.prepare(`
      INSERT INTO expenses (id, target, detail, amount, expense_type, payment_method, expense_date, remark, office, updated_at)
      VALUES (@id, @target, @detail, @amount, @expense_type, @payment_method, @expense_date, @remark, @office, @updated_at)
    `);
    for (const e of snapshot.expenses) insertExpense.run({
      id: e.id, target: e.target, detail: e.detail, amount: e.amount,
      expense_type: e.expense_type, payment_method: e.payment_method,
      expense_date: e.expense_date, remark: e.remark ?? null, office: e.office ? 1 : 0,
      updated_at: new Date().toISOString(),
    });

    // Cash entries
    db.prepare("DELETE FROM cash_entries").run();
    const insertCash = db.prepare(`
      INSERT INTO cash_entries (id, type, amount, date, note, updated_at)
      VALUES (@id, @type, @amount, @date, @note, @updated_at)
    `);
    for (const c of snapshot.cashEntries) insertCash.run({
      id: c.id, type: c.type, amount: c.amount, date: c.date, note: c.note ?? null,
      updated_at: new Date().toISOString(),
    });

    // Materials
    db.prepare("DELETE FROM materials").run();
    const insertMaterial = db.prepare(`
      INSERT INTO materials (id, code, name, specification, size, unit, stock_quantity, min_stock,
        factory_price_rmb, usd_cost, sale_price_usd, vip_sale_price_usd, weight, purchase_price,
        supplier, image, last_stock_date, remark, updated_at)
      VALUES (@id, @code, @name, @specification, @size, @unit, @stock_quantity, @min_stock,
        @factory_price_rmb, @usd_cost, @sale_price_usd, @vip_sale_price_usd, @weight, @purchase_price,
        @supplier, @image, @last_stock_date, @remark, @updated_at)
    `);
    for (const m of snapshot.materials) insertMaterial.run({
      id: m.id, code: m.code ?? "", name: m.name, specification: m.specification ?? null,
      size: m.size ?? null, unit: m.unit, stock_quantity: m.stock_quantity ?? 0,
      min_stock: m.min_stock ?? 0, factory_price_rmb: m.factory_price_rmb ?? 0,
      usd_cost: m.usd_cost ?? 0, sale_price_usd: m.sale_price_usd ?? 0,
      vip_sale_price_usd: m.vip_sale_price_usd ?? null, weight: m.weight ?? null,
      purchase_price: m.purchase_price ?? 0, supplier: m.supplier ?? null,
      image: m.image ?? null, last_stock_date: m.last_stock_date ?? null,
      remark: m.remark ?? null, updated_at: new Date().toISOString(),
    });

    // Purchases
    db.prepare("DELETE FROM purchases").run();
    const insertPurchase = db.prepare(`
      INSERT INTO purchases (id, supplier, item_name, quantity, unit, unit_price, total_amount, purchase_date, status, expense_id, updated_at)
      VALUES (@id, @supplier, @item_name, @quantity, @unit, @unit_price, @total_amount, @purchase_date, @status, @expense_id, @updated_at)
    `);
    for (const p of snapshot.purchases) insertPurchase.run({
      id: p.id, supplier: p.supplier, item_name: p.item_name, quantity: p.quantity,
      unit: p.unit, unit_price: p.unit_price, total_amount: p.total_amount,
      purchase_date: p.purchase_date, status: p.status, expense_id: p.expense_id ?? null,
      updated_at: new Date().toISOString(),
    });

    // Employees
    db.prepare("DELETE FROM employees").run();
    const insertEmployee = db.prepare(`
      INSERT INTO employees (id, code, name, position, phone, hire_date, contract_end,
        monthly_salary, hourly_rate, workdays, meal_allowance_eligible, ethnicity, status, updated_at)
      VALUES (@id, @code, @name, @position, @phone, @hire_date, @contract_end,
        @monthly_salary, @hourly_rate, @workdays, @meal_allowance_eligible, @ethnicity, @status, @updated_at)
    `);
    for (const e of snapshot.employees) insertEmployee.run({
      id: e.id, code: e.code ?? null, name: e.name, position: e.position ?? null,
      phone: e.phone ?? null, hire_date: e.hire_date ?? null, contract_end: e.contract_end ?? null,
      monthly_salary: e.monthly_salary ?? 0, hourly_rate: e.hourly_rate ?? null,
      workdays: JSON.stringify(e.workdays ?? []),
      meal_allowance_eligible: e.meal_allowance_eligible == null ? null : (e.meal_allowance_eligible ? 1 : 0),
      ethnicity: e.ethnicity ?? null, status: e.status ?? "在职",
      updated_at: new Date().toISOString(),
    });

    // Attendances
    db.prepare("DELETE FROM attendances").run();
    const insertAttendance = db.prepare(`
      INSERT INTO attendances (id, date, employee_id, employee_name, employee_code,
        leave_minutes, overtime_minutes, worked_minutes, meal_allowance, generated_by, note, updated_at)
      VALUES (@id, @date, @employee_id, @employee_name, @employee_code,
        @leave_minutes, @overtime_minutes, @worked_minutes, @meal_allowance, @generated_by, @note, @updated_at)
    `);
    for (const a of snapshot.attendances) insertAttendance.run({
      id: a.id, date: a.date, employee_id: a.employee_id ?? null,
      employee_name: a.employee_name, employee_code: a.employee_code ?? null,
      leave_minutes: a.leave_minutes ?? 0, overtime_minutes: a.overtime_minutes ?? 0,
      worked_minutes: a.worked_minutes ?? 0, meal_allowance: a.meal_allowance ? 1 : 0,
      generated_by: a.generated_by ?? null, note: a.note ?? null,
      updated_at: new Date().toISOString(),
    });

    // Appointments
    db.prepare("DELETE FROM appointments").run();
    const insertAppointment = db.prepare(`
      INSERT INTO appointments (id, client_name, client_id, phone, address, appointment_date, description, gcal_event_id, updated_at)
      VALUES (@id, @client_name, @client_id, @phone, @address, @appointment_date, @description, @gcal_event_id, @updated_at)
    `);
    for (const a of snapshot.appointments) insertAppointment.run({
      id: a.id, client_name: a.client_name, client_id: a.client_id ?? null,
      phone: a.phone ?? null, address: a.address ?? null,
      appointment_date: a.appointment_date, description: a.description ?? null,
      gcal_event_id: a.gcal_event_id ?? null, updated_at: new Date().toISOString(),
    });

    // Payrolls
    db.prepare("DELETE FROM payrolls").run();
    const insertPayroll = db.prepare(`
      INSERT INTO payrolls (id, month, employee_id, employee_name, employee_code, employee_ethnicity,
        total_hours, hourly_rate, meal_allowance_total, base_salary, bonus, deduction, net_salary,
        payment_status, paid_at, expense_id, updated_at)
      VALUES (@id, @month, @employee_id, @employee_name, @employee_code, @employee_ethnicity,
        @total_hours, @hourly_rate, @meal_allowance_total, @base_salary, @bonus, @deduction, @net_salary,
        @payment_status, @paid_at, @expense_id, @updated_at)
    `);
    for (const p of snapshot.payrolls) insertPayroll.run({
      id: p.id, month: p.month, employee_id: p.employee_id ?? null,
      employee_name: p.employee_name, employee_code: p.employee_code ?? null,
      employee_ethnicity: p.employee_ethnicity ?? null,
      total_hours: p.total_hours ?? null, hourly_rate: p.hourly_rate ?? null,
      meal_allowance_total: p.meal_allowance_total ?? null,
      base_salary: p.base_salary ?? 0, bonus: p.bonus ?? 0, deduction: p.deduction ?? 0,
      net_salary: p.net_salary ?? 0, payment_status: p.payment_status ?? "未支付",
      paid_at: p.paid_at ?? null, expense_id: p.expense_id ?? null,
      updated_at: new Date().toISOString(),
    });

    // Quotes
    db.prepare("DELETE FROM quotes").run();
    const insertQuote = db.prepare(`
      INSERT INTO quotes (id, client_name, title, amount, created_at, valid_until, status, updated_at)
      VALUES (@id, @client_name, @title, @amount, @created_at, @valid_until, @status, @updated_at)
    `);
    for (const q of snapshot.quotes) insertQuote.run({
      id: q.id, client_name: q.client_name, title: q.title, amount: q.amount,
      created_at: q.created_at, valid_until: q.valid_until, status: q.status,
      updated_at: new Date().toISOString(),
    });

    // Showcases
    db.prepare("DELETE FROM showcases").run();
    const insertShowcase = db.prepare(`
      INSERT INTO showcases (id, name, category, image_count, description, created_at, status, updated_at)
      VALUES (@id, @name, @category, @image_count, @description, @created_at, @status, @updated_at)
    `);
    for (const s of snapshot.showcases) insertShowcase.run({
      id: s.id, name: s.name, category: s.category, image_count: s.image_count ?? 0,
      description: s.description ?? null, created_at: s.created_at, status: s.status,
      updated_at: new Date().toISOString(),
    });

    // Print archives
    db.prepare("DELETE FROM print_archives").run();
    const insertPrint = db.prepare(`
      INSERT INTO print_archives (id, order_number, client_name, order_type, print_type,
        title, created_at, created_by, amount, file_name, html, summary, updated_at)
      VALUES (@id, @order_number, @client_name, @order_type, @print_type,
        @title, @created_at, @created_by, @amount, @file_name, @html, @summary, @updated_at)
    `);
    for (const p of snapshot.printArchives) insertPrint.run({
      id: p.id, order_number: p.order_number, client_name: p.client_name,
      order_type: p.order_type, print_type: p.print_type,
      title: p.title, created_at: p.created_at, created_by: p.created_by ?? null,
      amount: p.amount ?? null, file_name: p.file_name, html: p.html,
      summary: p.summary ?? null, updated_at: new Date().toISOString(),
    });
  });

  txn();
}

// ─── Redis implementation (Vercel) ────────────────────────────────────────────

const KV_KEY = "biz-store";

async function redisRead(): Promise<BizStoreSnapshot> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<BizStoreSnapshot>(KV_KEY);
  if (stored) return stored;

  // First time: seed from static data
  const seed = await buildSeedDefault();
  await kv.set(KV_KEY, seed).catch(() => {});
  return seed;
}

async function redisWrite(snapshot: BizStoreSnapshot): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, snapshot).catch((err: unknown) =>
    console.error("[biz-store] redis write failed", err)
  );
}

// ─── Seed data (first-time initialisation) ────────────────────────────────────

async function buildSeedDefault(): Promise<BizStoreSnapshot> {
  const { bizOrders, bizClients, bizSuppliers, bizExpenses, bizCashEntries,
    bizMaterials, bizPurchases, bizEmployees, bizAttendances, bizAppointments,
    bizPayrolls, bizQuotes, bizShowcases, bizPrintArchives, bizSettings } =
    await import("@/lib/biz-data");

  return {
    orders: bizOrders, clients: bizClients, suppliers: bizSuppliers,
    expenses: bizExpenses, cashEntries: bizCashEntries, materials: bizMaterials,
    purchases: bizPurchases, employees: bizEmployees, attendances: bizAttendances,
    appointments: bizAppointments, payrolls: bizPayrolls, quotes: bizQuotes,
    showcases: bizShowcases, printArchives: bizPrintArchives,
    settings: bizSettings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function readBizStore(): Promise<BizStoreSnapshot> {
  const backend = await getStore();
  if (backend === "redis") return redisRead();
  return sqliteRead();
}

export async function writeBizStore(snapshot: BizStoreSnapshot): Promise<void> {
  const backend = await getStore();
  if (backend === "redis") return redisWrite(snapshot);
  return sqliteWrite(snapshot);
}

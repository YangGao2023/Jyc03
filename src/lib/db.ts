import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "biz-store.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      company_name TEXT NOT NULL DEFAULT '',
      company_name_zh TEXT DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      company_address TEXT DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      phones TEXT DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      tax_number TEXT NOT NULL DEFAULT '',
      default_tax_rate REAL NOT NULL DEFAULT 0,
      default_currency TEXT NOT NULL DEFAULT 'USD',
      fiscal_start_month INTEGER NOT NULL DEFAULT 1,
      bank_account TEXT NOT NULL DEFAULT '',
      alipay TEXT NOT NULL DEFAULT '',
      wechat_pay TEXT NOT NULL DEFAULT '',
      other_payment TEXT NOT NULL DEFAULT '',
      invoice_title TEXT DEFAULT '',
      picking_title TEXT DEFAULT '',
      zelle TEXT DEFAULT '',
      invoice_note TEXT DEFAULT '',
      quote_valid_days INTEGER NOT NULL DEFAULT 30,
      quote_footer TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      expense_types TEXT DEFAULT '',
      supplier_categories TEXT DEFAULT '',
      meal_allowance_amount REAL DEFAULT 15,
      auto_attendance_timezone TEXT DEFAULT 'America/New_York',
      auto_attendance_run_time TEXT DEFAULT '01:00',
      auto_attendance_default_minutes INTEGER DEFAULT 600,
      auto_attendance_note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_number TEXT PRIMARY KEY,
      order_type TEXT NOT NULL DEFAULT '定制单',
      client_name TEXT NOT NULL,
      client_id TEXT,
      phone TEXT,
      address TEXT,
      preview_image TEXT,
      description TEXT,
      total_price REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_after_tax REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      order_date TEXT,
      status TEXT DEFAULT '下单',
      operation_type TEXT,
      install_info TEXT,
      remarks TEXT,
      payment_history TEXT DEFAULT '[]',
      material_rows TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT,
      note TEXT,
      is_vip INTEGER DEFAULT 0,
      balance REAL DEFAULT 0,
      wechat TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      address TEXT,
      last_purchase_date TEXT,
      remark TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      detail TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      expense_type TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      remark TEXT,
      office INTEGER DEFAULT 0,
      source_type TEXT,
      source_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cash_entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      note TEXT,
      order_number TEXT,
      source_type TEXT,
      source_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      specification TEXT,
      size TEXT,
      unit TEXT NOT NULL DEFAULT '个',
      stock_quantity REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      factory_price_rmb REAL DEFAULT 0,
      usd_cost REAL DEFAULT 0,
      sale_price_usd REAL DEFAULT 0,
      vip_sale_price_usd REAL,
      weight REAL,
      purchase_price REAL DEFAULT 0,
      supplier TEXT,
      supplier_id TEXT,
      image TEXT,
      last_stock_date TEXT,
      remark TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      supplier TEXT NOT NULL,
      supplier_id TEXT,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '个',
      unit_price REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      purchase_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '待收货',
      expense_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      position TEXT,
      phone TEXT,
      hire_date TEXT,
      contract_end TEXT,
      monthly_salary REAL DEFAULT 0,
      hourly_rate REAL,
      workdays TEXT DEFAULT '[]',
      meal_allowance_eligible INTEGER,
      ethnicity TEXT,
      status TEXT NOT NULL DEFAULT '在职',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      employee_id TEXT,
      employee_name TEXT NOT NULL,
      employee_code TEXT,
      leave_minutes REAL DEFAULT 0,
      overtime_minutes REAL DEFAULT 0,
      worked_minutes REAL DEFAULT 0,
      meal_allowance INTEGER DEFAULT 0,
      generated_by TEXT,
      note TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_id TEXT,
      phone TEXT,
      address TEXT,
      appointment_date TEXT NOT NULL,
      description TEXT,
      gcal_event_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payrolls (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      employee_id TEXT,
      employee_name TEXT NOT NULL,
      employee_code TEXT,
      employee_ethnicity TEXT,
      total_hours REAL,
      hourly_rate REAL,
      meal_allowance_total REAL,
      base_salary REAL NOT NULL DEFAULT 0,
      bonus REAL DEFAULT 0,
      deduction REAL DEFAULT 0,
      net_salary REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT '未支付',
      paid_at TEXT,
      expense_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_id TEXT,
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '待确认',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS showcases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_count INTEGER DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '展示中',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS print_archives (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      order_type TEXT NOT NULL,
      print_type TEXT NOT NULL DEFAULT 'invoice',
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      amount REAL,
      file_name TEXT NOT NULL,
      html TEXT NOT NULL,
      summary TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_meta (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      revision TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  ensureColumn(db, "orders", "client_id", "TEXT");
  ensureColumn(db, "expenses", "source_type", "TEXT");
  ensureColumn(db, "expenses", "source_id", "TEXT");
  ensureColumn(db, "cash_entries", "order_number", "TEXT");
  ensureColumn(db, "expenses", "voided", "INTEGER DEFAULT 0");
  ensureColumn(db, "cash_entries", "voided", "INTEGER DEFAULT 0");
  ensureColumn(db, "cash_entries", "source_type", "TEXT");
  ensureColumn(db, "cash_entries", "source_id", "TEXT");
  ensureColumn(db, "materials", "supplier_id", "TEXT");
  ensureColumn(db, "purchases", "supplier_id", "TEXT");
  ensureColumn(db, "quotes", "client_id", "TEXT");
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (existing.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// ─── Row mapping helpers ─────────────────────────────────────────────────────
// Convert SQLite row to TypeScript type (handles JSON columns and booleans)

function rowToSettings(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    company_name: String(row.company_name ?? ""),
    company_name_zh: row.company_name_zh ? String(row.company_name_zh) : undefined,
    address: String(row.address ?? ""),
    company_address: row.company_address ? String(row.company_address) : undefined,
    phone: String(row.phone ?? ""),
    phones: row.phones ? String(row.phones) : undefined,
    email: String(row.email ?? ""),
    website: String(row.website ?? ""),
    tax_number: String(row.tax_number ?? ""),
    default_tax_rate: Number(row.default_tax_rate ?? 0),
    default_currency: String(row.default_currency ?? "USD"),
    fiscal_start_month: Number(row.fiscal_start_month ?? 1),
    bank_account: String(row.bank_account ?? ""),
    alipay: String(row.alipay ?? ""),
    wechat_pay: String(row.wechat_pay ?? ""),
    other_payment: String(row.other_payment ?? ""),
    invoice_title: row.invoice_title ? String(row.invoice_title) : undefined,
    picking_title: row.picking_title ? String(row.picking_title) : undefined,
    zelle: row.zelle ? String(row.zelle) : undefined,
    invoice_note: row.invoice_note ? String(row.invoice_note) : undefined,
    quote_valid_days: Number(row.quote_valid_days ?? 30),
    quote_footer: String(row.quote_footer ?? ""),
    logo_url: String(row.logo_url ?? ""),
    expense_types: row.expense_types ? String(row.expense_types) : undefined,
    supplier_categories: row.supplier_categories ? String(row.supplier_categories) : undefined,
    meal_allowance_amount: Number(row.meal_allowance_amount ?? 15),
    auto_attendance_timezone: String(row.auto_attendance_timezone ?? "America/New_York"),
    auto_attendance_run_time: String(row.auto_attendance_run_time ?? "01:00"),
    auto_attendance_default_minutes: Number(row.auto_attendance_default_minutes ?? 600),
    auto_attendance_note: String(row.auto_attendance_note ?? ""),
  };
}

// Export for use in biz-store.ts
export { rowToSettings };

/**
 * MySQL 数据库连接管理器
 * 替换原来的 SQLite (better-sqlite3) + Redis
 */
import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '43.166.250.145',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'dbo001',
      password: process.env.MYSQL_PASS || 'BDQN123456',
      database: process.env.MYSQL_DB || 'db_zhty202410',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function closeMysql() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function queryRows(sql: string, params?: any[]): Promise<Record<string, unknown>[]> {
  const p = getMysqlPool();
  const [rows] = await p.execute(sql, params || []);
  return rows as Record<string, unknown>[];
}

export async function executeStmt(sql: string, params?: any[]): Promise<{ affectedRows: number }> {
  const p = getMysqlPool();
  const [result] = await p.execute(sql, params || []);
  return result as { affectedRows: number };
}

/** Map a settings DB row to BizSettings object */
export function rowToSettings(row: Record<string, unknown> | undefined) {
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
    work_start: row.work_start ? String(row.work_start) : undefined,
    work_end: row.work_end ? String(row.work_end) : undefined,
    break_start: row.break_start ? String(row.break_start) : undefined,
    break_end: row.break_end ? String(row.break_end) : undefined,
    material_categories: row.material_categories ? String(row.material_categories) : undefined,
  };
}

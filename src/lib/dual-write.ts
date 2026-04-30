/**
 * 双向写工具 — 网站 ↔ 旧 T 表同步
 *
 * 正向（网站 → 旧T）：mysqlWrite 后调用 syncAllNewToOldTables()
 * 反向（旧T → 网站）：mysqlRead 前调用 syncFromOldTablesIfNeeded()
 *
 * 金额：旧系统"分"(int) ↔ 网站"元"(decimal)
 * 日期：旧系统 YYYYMMDD (char8) ↔ 网站 YYYY-MM-DD (varchar10)
 * 支付方式：1=现金 2=支票 3=转账 4=刷卡
 * 时间戳：旧系统 T1/T2 是毫秒级 Unix 时间戳（bigint）
 */
import { executeStmt, queryRows } from "@/lib/db-mysql";

// ─── 常量 ──────────────────────────────────────────────────────────────

const SYNC_SETTING_KEY = "last_sync_ts";
const SYNC_COOLDOWN_MS = 30_000; // 两次反向同步间隔至少30秒

// ─── 单位工具 ──────────────────────────────────────────────────────────

function toYyyymmdd(dateStr?: string | null): string {
  if (!dateStr) return "00000000";
  return dateStr.replace(/-/g, "");
}

function fromYyyymmdd(yyyymmdd: string | number): string {
  const s = String(yyyymmdd);
  if (s.length === 8) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  return s;
}

function toCents(dollars?: number | null): number {
  return Math.round((dollars ?? 0) * 100);
}

function fromCents(cents?: number | null): number {
  return Math.round(((cents ?? 0) / 100) * 100) / 100;
}

function codeToMethod(code: number): string {
  switch (code) { case 1: return "现金"; case 2: return "支票"; case 3: return "转账"; case 4: return "刷卡"; default: return "现金"; }
}

function methodToCode(method?: string | null): number {
  switch ((method || "").trim()) {
    case "现金": return 1; case "支票": return 2;
    case "转账": case "银行转账": return 3; case "刷卡": return 4; case "Zelle": return 3;
    default: return 1;
  }
}

function orderTypeFromCode(code: number): string { return code === 2 ? "批发单" : "定制单"; }
function statusFromZ1(z1: number): string {
  switch (z1) { case 1: return "下单"; case 2: return "未付清"; case 6: return "结清"; case 9: return "已关闭"; default: return "下单"; }
}
function orderTypeToCode(ot?: string): number { return (ot === "批发单" || ot === "批发订单") ? 2 : 1; }
function statusToZ1(s: string): number {
  switch (s) { case "下单": return 1; case "未付清": return 2; case "结清": return 6; case "已关闭": return 9; default: return 99; }
}
function newNegId(): number { return -(Date.now() % 1000000000) - Math.floor(Math.random() * 9000); }

// ═══════════════════════════════════════════════════════════════════════
// 反向同步（旧T → 网站）
// ═══════════════════════════════════════════════════════════════════════

async function getLastSyncTs(): Promise<number> {
  const rows = await queryRows("SELECT v FROM a3s_sync_state WHERE k = ?", [SYNC_SETTING_KEY]);
  if (rows.length > 0 && rows[0].v != null) {
    const v = Number(rows[0].v);
    return Number.isFinite(v) ? v : 0;
  }
  const now = Date.now();
  await executeStmt("INSERT INTO a3s_sync_state(k, v) VALUES(?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [SYNC_SETTING_KEY, String(now)]);
  return now;
}

async function updateLastSyncTs(): Promise<void> {
  await executeStmt("UPDATE a3s_sync_state SET v = ? WHERE k = ?", [String(Date.now()), SYNC_SETTING_KEY]);
}

async function hasNewerData(lastMs: number): Promise<boolean> {
  const lastMsStr = String(Math.floor(lastMs));
  const tables = ["T1111","T1113","T1200","T1002","T1001","T1003"];
  const results = await Promise.all(tables.map(t =>
    queryRows(`SELECT MAX(T2) as mx FROM ${t} WHERE T2 > ?`, [lastMsStr]).then(rows => {
      return rows.length > 0 && rows[0].mx != null && Number(rows[0].mx) > lastMs;
    }).catch(() => false)
  ));
  return results.some(Boolean);
}

/**
 * 从旧 T 表同步订单（含收款记录）
 */
async function syncOrdersFromOld(lastMs: number): Promise<number> {
  let count = 0;
  const t1111Rows = await queryRows(
    `SELECT * FROM T1111 WHERE T2 > ? ORDER BY T1 ASC`, [String(Math.floor(lastMs))],
  );

  for (const t of t1111Rows) {
    const p1 = Number(t.P1);
    const orderNumber = String(t.C1 || "");
    if (!orderNumber) continue;

    const payments = await queryRows("SELECT * FROM T1113 WHERE P2 = ? ORDER BY T1 ASC", [p1]);
    const paymentHistory = payments.map((p: any) => ({
      date: fromYyyymmdd(String(p.C4 || "")),
      amount: fromCents(Number(p.C2)),
      method: "现金", // 旧T1113没有支付方式字段，默认现金
      type: Number(p.C1) === 0 ? "refund" : "payment",
      note: String(p.C5 || ""),
    }));

    const totalPaid = payments
      .filter((p: any) => Number(p.C1) === 1)
      .reduce((sum: number, p: any) => sum + fromCents(Number(p.C2)), 0);
    const totalPrice = fromCents(Number(t.C7));
    const balance = Math.round((totalPrice - totalPaid) * 100) / 100;

    await executeStmt(
      `INSERT INTO a3s_orders(
        order_number, order_type, client_name, phone, address,
        preview_image, description, install_info, total_price,
        total_after_tax, amount_paid, balance, order_date,
        status, remarks, payment_history, material_rows, old_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'[]',?)
      ON DUPLICATE KEY UPDATE
        order_type=VALUES(order_type), client_name=VALUES(client_name),
        phone=VALUES(phone), total_price=VALUES(total_price),
        total_after_tax=VALUES(total_after_tax), amount_paid=VALUES(amount_paid),
        balance=VALUES(balance), order_date=VALUES(order_date),
        status=VALUES(status), remarks=VALUES(remarks),
        payment_history=VALUES(payment_history), old_id=VALUES(old_id)`,
      [
        orderNumber,
        orderTypeFromCode(Number(t.C2)),
        String(t.C17 || ""),
        String(t.C18 || ""),
        String(t.C19 || ""),
        String(t.C4 || ""),
        String(t.C5 || ""),
        String(t.C3 || ""),
        totalPrice,
        totalPrice,
        totalPaid,
        balance,
        fromYyyymmdd(String(t.C8 || "")),
        statusFromZ1(Number(t.Z1)),
        String(t.C10 || ""),
        JSON.stringify(paymentHistory),
        p1,
      ],
    );
    count++;
  }
  return count;
}

/**
 * 从旧 T1200 同步现金收支
 */
async function syncCashFlowFromOld(lastMs: number): Promise<number> {
  let count = 0;
  const rows = await queryRows(
    `SELECT * FROM T1200 WHERE T2 > ? ORDER BY T1 ASC`, [String(Math.floor(lastMs))],
  );

  for (const t of rows) {
    const p1 = Number(t.P1);
    const isIncome = Number(t.Z2) === 1;
    const amount = fromCents(Number(t.C5));

    if (isIncome) {
      await executeStmt(
        `INSERT INTO a3s_cash_entries(id, type, amount, date, method, note, old_id)
         VALUES(?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           type=VALUES(type), amount=VALUES(amount), date=VALUES(date),
           method=VALUES(method), note=VALUES(note)`,
        [`old_inc_${p1}`, "收入", amount, fromYyyymmdd(String(t.C6 || "")), codeToMethod(Number(t.C4)), String(t.C7 || t.C3 || ""), p1],
      );
    } else {
      await executeStmt(
        `INSERT INTO a3s_expenses(id, amount, expense_date, payment_method, target, detail, remark, old_id)
         VALUES(?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           amount=VALUES(amount), expense_date=VALUES(expense_date),
           payment_method=VALUES(payment_method), target=VALUES(target),
           detail=VALUES(detail), remark=VALUES(remark)`,
        [`old_exp_${p1}`, amount, fromYyyymmdd(String(t.C6 || "")), codeToMethod(Number(t.C4)), String(t.C2 || ""), String(t.C3 || t.C2 || ""), String(t.C7 || ""), p1],
      );
    }
    count++;
  }
  return count;
}

/**
 * 从旧 T1002 同步客户
 */
async function syncClientsFromOld(lastMs: number): Promise<number> {
  let count = 0;
  const rows = await queryRows(
    `SELECT * FROM T1002 WHERE T2 > ? ORDER BY T1 ASC`, [String(Math.floor(lastMs))],
  );
  for (const t of rows) {
    const p1 = Number(t.P1);
    await executeStmt(
      `INSERT INTO a3s_clients(id, name, phone, address, contact, note, old_id)
       VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
         name=VALUES(name), phone=VALUES(phone), address=VALUES(address),
         contact=VALUES(contact), note=VALUES(note)`,
      [`old_cli_${p1}`, String(t.C1 || ""), String(t.C2 || ""), String(t.C3 || ""), String(t.C4 || ""), String(t.C15 || ""), p1],
    );
    count++;
  }
  return count;
}

/**
 * 从旧 T1001 同步物料
 */
async function syncMaterialsFromOld(lastMs: number): Promise<number> {
  let count = 0;
  const rows = await queryRows(
    `SELECT * FROM T1001 WHERE T2 > ? ORDER BY T1 ASC`, [String(Math.floor(lastMs))],
  );
  for (const t of rows) {
    const p1 = Number(t.P1);
    await executeStmt(
      `INSERT INTO a3s_materials(id, code, name, specification, size, unit,
        factory_price_rmb, usd_cost, sale_price_usd, stock_quantity, supplier, old_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
         code=VALUES(code), name=VALUES(name), specification=VALUES(specification),
         size=VALUES(size), unit=VALUES(unit), factory_price_rmb=VALUES(factory_price_rmb),
         usd_cost=VALUES(usd_cost), sale_price_usd=VALUES(sale_price_usd),
         stock_quantity=VALUES(stock_quantity), supplier=VALUES(supplier)`,
      [`old_mat_${p1}`, String(t.C1 || ""), String(t.C3 || ""), String(t.C4 || ""),
       String(t.C5 || ""), (String(t.C6 || "").trim().slice(0, 20) || "个"),
       String(t.C7 || "0"), String(t.C8 || "0"), String(t.C9 || "0"),
       Number(t.C10) || 0, String(t.C11 || ""), p1],
    );
    count++;
  }
  return count;
}

/**
 * 从旧 T1114 同步预约
 */
async function syncAppointmentsFromOld(lastMs: number): Promise<number> {
  let count = 0;
  const rows = await queryRows(
    `SELECT * FROM T1114 WHERE T2 > ? ORDER BY T1 ASC`, [String(Math.floor(lastMs))],
  );
  for (const t of rows) {
    const p1 = Number(t.P1);
    await executeStmt(
      `INSERT INTO a3s_appointments(id, client_name, appointment_date, appointment_time, description, old_id)
       VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
         client_name=VALUES(client_name), appointment_date=VALUES(appointment_date),
         appointment_time=VALUES(appointment_time), description=VALUES(description)`,
      [`old_appt_${p1}`, String(t.C1 || ""), fromYyyymmdd(String(t.C2 || "")), String(t.C3 || ""), String(t.C4 || ""), p1],
    );
    count++;
  }
  return count;
}

// ─── 反向同步统一入口 ──────────────────────────────────────────────────

let _lastCheck = 0;
let _pendingCheck: Promise<void> | null = null;

export async function syncFromOldTablesIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - _lastCheck < SYNC_COOLDOWN_MS) return;
  if (_pendingCheck) return _pendingCheck;

  _pendingCheck = (async () => {
    try {
      const lastTs = await getLastSyncTs();
      const hasNew = await hasNewerData(lastTs);
      if (!hasNew) return;

      console.log("[reverse-sync] New data detected, syncing...");
      const results = await Promise.allSettled([
        syncOrdersFromOld(lastTs),
        syncCashFlowFromOld(lastTs),
        syncClientsFromOld(lastTs),
        syncMaterialsFromOld(lastTs),
        syncAppointmentsFromOld(lastTs),
      ]);

      const total = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
      console.log(`[reverse-sync] Synced ${total} records`);

      const errors = results.filter(r => r.status === "rejected");
      if (errors.length > 0) {
        console.error("[reverse-sync] Errors:", errors.map((e: any) => e.reason?.message || e.reason));
      }

      await updateLastSyncTs();
    } catch (err) {
      console.error("[reverse-sync] Failed:", err);
    } finally {
      _lastCheck = Date.now();
      _pendingCheck = null;
    }
  })();

  return _pendingCheck;
}

// ═══════════════════════════════════════════════════════════════════════
// 正向同步（网站 → 旧T）
// ═══════════════════════════════════════════════════════════════════════

async function getNewIds(table: string, idCol: string): Promise<string[]> {
  const rows = await queryRows(`SELECT ${idCol} FROM ${table} WHERE (old_id IS NULL OR old_id = 0)`);
  return rows.map((r) => String(r[idCol]));
}

export async function syncNewOrdersToOld(): Promise<void> {
  const orderNumbers = await getNewIds("a3s_orders", "order_number");
  if (orderNumbers.length === 0) return;

  const ph = orderNumbers.map(() => "?").join(",");
  const orders = await queryRows(`SELECT * FROM a3s_orders WHERE order_number IN (${ph})`, orderNumbers);

  for (const row of orders) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();
    const orderNumber = String(row.order_number);
    const orderType = String(row.order_type);

    await executeStmt(
      `INSERT INTO T1111(P1,P2,P3,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,T1,T2,Z1)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'',?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         C1=VALUES(C1),C2=VALUES(C2),C6=VALUES(C6),C7=VALUES(C7),
         C8=VALUES(C8),C10=VALUES(C10),Z1=VALUES(Z1),T2=VALUES(T2)`,
      [
        p1, Number(row.client_id) || 0, 0,
        orderNumber, orderTypeToCode(orderType),
        String(row.install_info || ""), String(row.preview_image || ""), String(row.description || ""),
        0, toCents(Number(row.total_price)), toYyyymmdd(String(row.order_date)),
        String(row.remarks || ""), String(row.install_info || ""),
        nowSec, nowSec, statusToZ1(String(row.status || "下单")),
      ],
    );

    await executeStmt("UPDATE a3s_orders SET old_id = ? WHERE order_number = ?", [p1, orderNumber]);

    try {
      const payments = JSON.parse(String(row.payment_history || "[]"));
      if (Array.isArray(payments)) {
        for (const p of payments) {
          await executeStmt(
            `INSERT INTO T1113(P1,P2,P3,C1,C2,C3,C4,C5,T1,T2,Z1)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            [
              newNegId(), p1, 0,
              p.type === "refund" ? 0 : 1, toCents(p.amount),
              p.type === "refund" ? `${orderType}退款` : `${orderType}收款`,
              toYyyymmdd(p.date),
              p.note ? `${p.method || "现金"} ${p.note}` : (p.method || "现金"),
              nowSec, nowSec, 1,
            ],
          );
        }
      }
    } catch (_) {}
  }
}

export async function syncNewCashEntriesToOld(): Promise<void> {
  const ids = await getNewIds("a3s_cash_entries", "id");
  if (ids.length === 0) return;

  const ph = ids.map(() => "?").join(",");
  const rows = await queryRows(`SELECT * FROM a3s_cash_entries WHERE id IN (${ph})`, ids);

  for (const row of rows) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();
    const entryType = String(row.type);
    const orderNumber = row.order_number ? String(row.order_number) : "";
    let orderP1 = 0;
    if (orderNumber) {
      const o = await queryRows("SELECT old_id FROM a3s_orders WHERE order_number = ?", [orderNumber]);
      if (o.length > 0) orderP1 = Number(o[0].old_id) || 0;
    }

    await executeStmt(
      `INSERT INTO T1200(P1,P2,P3,P4,P5,P6,C1,C2,C3,C4,C5,C6,C7,T1,T2,Z1,Z2)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p1, orderP1, 1, 0, 0, 0,
        entryType === "支出" ? 9 : 2,
        entryType === "支出" ? "" : (String(row.note || "") || "销售收入"),
        String(row.note || "") || (entryType === "收入" ? "销售收入" : "支出"),
        methodToCode(String(row.method)), toCents(Number(row.amount)),
        toYyyymmdd(String(row.date)), String(row.note || ""),
        nowSec, nowSec, 1, entryType === "收入" ? 1 : 0,
      ],
    );
    await executeStmt("UPDATE a3s_cash_entries SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

export async function syncNewExpensesToOld(): Promise<void> {
  const ids = await getNewIds("a3s_expenses", "id");
  if (ids.length === 0) return;

  const ph = ids.map(() => "?").join(",");
  const rows = await queryRows(`SELECT * FROM a3s_expenses WHERE id IN (${ph})`, ids);

  for (const row of rows) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();
    await executeStmt(
      `INSERT INTO T1200(P1,P2,P3,P4,P5,P6,C1,C2,C3,C4,C5,C6,C7,T1,T2,Z1,Z2)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p1, 0, 1, 0, 0, 0, 9,
        String(row.target || ""), String(row.detail || row.target || ""),
        methodToCode(String(row.payment_method)), toCents(Number(row.amount)),
        toYyyymmdd(String(row.expense_date)), String(row.remark || ""),
        nowSec, nowSec, 1, 0,
      ],
    );
    await executeStmt("UPDATE a3s_expenses SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

export async function syncNewClientsToOld(): Promise<void> {
  const ids = await getNewIds("a3s_clients", "id");
  if (ids.length === 0) return;

  const ph = ids.map(() => "?").join(",");
  const rows = await queryRows(`SELECT * FROM a3s_clients WHERE id IN (${ph})`, ids);

  for (const row of rows) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();
    await executeStmt(
      `INSERT INTO T1002(P1,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,C14,C15,T1,T2,Z1)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?)`,
      [
        p1, String(row.name || ""),
        parseInt(String(row.phone || "0").replace(/\D/g, "")) || 0,
        String(row.address || ""), String(row.contact || ""),
        "", "", "", "", "", "", "", String(row.note || ""),
        nowSec, nowSec, 1,
      ],
    );
    await executeStmt("UPDATE a3s_clients SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

export async function syncAllNewToOldTables(): Promise<void> {
  const results = await Promise.allSettled([
    syncNewOrdersToOld(), syncNewCashEntriesToOld(),
    syncNewExpensesToOld(), syncNewClientsToOld(),
  ]);
  const errors = results.filter((r) => r.status === "rejected");
  if (errors.length > 0) {
    console.error("[dual-write] Errors:", errors.map((e: any) => e.reason?.message || e.reason));
  }
}

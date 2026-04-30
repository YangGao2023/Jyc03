/**
 * 双向写工具
 * 网站写 a3s_ 表时，同步写旧 T 表（让旧 C# 程序能读到）
 *
 * 金额单位：旧系统用"分"(int)，网站用"元"(decimal)
 * 日期格式：旧系统用 YYYYMMDD (char8)，网站用 YYYY-MM-DD (varchar10)
 * 支付方式：旧系统 1=现金 2=支票 3=转账 4=刷卡
 */
import { executeStmt, queryRows, getMysqlPool } from "@/lib/db-mysql";

// ─── 工具函数 ──────────────────────────────────────────────────────────

function toYyyymmdd(dateStr?: string | null): string {
  if (!dateStr) return "00000000";
  return dateStr.replace(/-/g, "");
}

function toCents(dollars?: number | null): number {
  return Math.round((dollars ?? 0) * 100);
}

function methodToCode(method?: string | null): number {
  switch ((method || "").trim()) {
    case "现金": return 1;
    case "支票": return 2;
    case "转账":
    case "银行转账": return 3;
    case "刷卡": return 4;
    case "Zelle": return 3;
    default: return 1;
  }
}

function orderTypeToCode(orderType?: string): number {
  return (orderType === "批发单" || orderType === "批发订单") ? 2 : 1;
}

function statusToZ1(status: string): number {
  switch (status) {
    case "下单": return 1;
    case "未付清": return 2;
    case "结清": return 6;
    case "已关闭": return 9;
    default: return 99;
  }
}

function newNegId(): number {
  return -(Date.now() % 1000000000) - Math.floor(Math.random() * 9000);
}

// ─── 新记录同步：只处理 a3s_ 表中没有 old_id 的记录 ────────────────────────

async function getNewIds(table: string, idCol: string): Promise<string[]> {
  const rows = await queryRows(
    `SELECT ${idCol} FROM ${table} WHERE (old_id IS NULL OR old_id = 0)`,
  );
  return rows.map((r) => String(r[idCol]));
}

/**
 * 同步网站新增的订单到 T1111 + T1113
 * 只同步 a3s_orders 中 old_id 为空的新记录
 */
export async function syncNewOrdersToOld(): Promise<void> {
  const orderNumbers = await getNewIds("a3s_orders", "order_number");
  if (orderNumbers.length === 0) return;

  const placeholders = orderNumbers.map(() => "?").join(",");
  const orders = await queryRows(
    `SELECT * FROM a3s_orders WHERE order_number IN (${placeholders})`,
    orderNumbers,
  );

  for (const row of orders) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();
    const orderNumber = String(row.order_number);
    const orderType = String(row.order_type);

    // T1111
    await executeStmt(
      `INSERT INTO T1111(P1,P2,P3,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,T1,T2,Z1)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'',?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         C1=VALUES(C1),C2=VALUES(C2),C6=VALUES(C6),C7=VALUES(C7),
         C8=VALUES(C8),C10=VALUES(C10),Z1=VALUES(Z1),T2=VALUES(T2)`,
      [
        p1, // P1
        Number(row.client_id) || 0, // P2
        0, // P3
        orderNumber, // C1
        orderTypeToCode(orderType), // C2
        String(row.install_info || ""), // C3
        String(row.preview_image || ""), // C4
        String(row.description || ""), // C5
        0, // C6 - 件数
        toCents(Number(row.total_price)), // C7
        toYyyymmdd(String(row.order_date)), // C8
        String(row.remarks || ""), // C10
        String(row.install_info || ""), // C13
        nowSec, nowSec,
        statusToZ1(String(row.status || "下单")),
      ],
    );

    // 更新 old_id
    await executeStmt("UPDATE a3s_orders SET old_id = ? WHERE order_number = ?", [p1, orderNumber]);

    // payment_history JSON → T1113
    try {
      const payments = JSON.parse(String(row.payment_history || "[]"));
      if (Array.isArray(payments)) {
        for (const p of payments) {
          const methodLabel = (p.method || "收款") + "收款";
          await executeStmt(
            `INSERT INTO T1113(P1,P2,P3,C1,C2,C3,C4,C5,T1,T2,Z1)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            [
              newNegId(),
              p1, 0,
              p.type === "refund" ? 0 : 1,
              toCents(p.amount),
              p.type === "refund" ? `${orderType}退款` : `${orderType}收款`,
              toYyyymmdd(p.date),
              p.note ? `${methodLabel} ${p.note}` : methodLabel,
              nowSec, nowSec, 1,
            ],
          );
        }
      }
    } catch (_) {
      // payment_history JSON parse failed
    }
  }
}

/**
 * 同步网站新增的现金收支到 T1200
 */
export async function syncNewCashEntriesToOld(): Promise<void> {
  const ids = await getNewIds("a3s_cash_entries", "id");
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await queryRows(
    `SELECT * FROM a3s_cash_entries WHERE id IN (${placeholders})`,
    ids,
  );

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
        methodToCode(String(row.method)),
        toCents(Number(row.amount)),
        toYyyymmdd(String(row.date)),
        String(row.note || ""),
        nowSec, nowSec, 1,
        entryType === "收入" ? 1 : 0,
      ],
    );

    await executeStmt("UPDATE a3s_cash_entries SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

/**
 * 同步网站新增的支出到 T1200 (Z2=0)
 */
export async function syncNewExpensesToOld(): Promise<void> {
  const ids = await getNewIds("a3s_expenses", "id");
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await queryRows(
    `SELECT * FROM a3s_expenses WHERE id IN (${placeholders})`,
    ids,
  );

  for (const row of rows) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();

    await executeStmt(
      `INSERT INTO T1200(P1,P2,P3,P4,P5,P6,C1,C2,C3,C4,C5,C6,C7,T1,T2,Z1,Z2)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p1, 0, 1, 0, 0, 0, 9,
        String(row.target || ""),
        String(row.detail || row.target || ""),
        methodToCode(String(row.payment_method)),
        toCents(Number(row.amount)),
        toYyyymmdd(String(row.expense_date)),
        String(row.remark || ""),
        nowSec, nowSec, 1, 0,
      ],
    );

    await executeStmt("UPDATE a3s_expenses SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

/**
 * 同步网站新增的客户到 T1002
 */
export async function syncNewClientsToOld(): Promise<void> {
  const ids = await getNewIds("a3s_clients", "id");
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await queryRows(
    `SELECT * FROM a3s_clients WHERE id IN (${placeholders})`,
    ids,
  );

  for (const row of rows) {
    const nowSec = Math.floor(Date.now() / 1000);
    const p1 = newNegId();

    await executeStmt(
      `INSERT INTO T1002(P1,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,C14,C15,T1,T2,Z1)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?)`,
      [
        p1,
        String(row.name || ""),
        parseInt(String(row.phone || "0").replace(/\D/g, "")) || 0,
        String(row.address || ""),
        String(row.contact || ""),
        "", "", "", "", "", "", "",
        String(row.note || ""),
        nowSec, nowSec, 1,
      ],
    );

    await executeStmt("UPDATE a3s_clients SET old_id = ? WHERE id = ?", [p1, String(row.id)]);
  }
}

/**
 * 同步所有新记录到旧 T 表
 * 在 mysqlWrite 写入 a3s_ 表之后调用
 */
export async function syncAllNewToOldTables(): Promise<void> {
  const results = await Promise.allSettled([
    syncNewOrdersToOld(),
    syncNewCashEntriesToOld(),
    syncNewExpensesToOld(),
    syncNewClientsToOld(),
  ]);

  const errors = results.filter((r) => r.status === "rejected");
  if (errors.length > 0) {
    console.error(
      "[dual-write] Sync errors:",
      errors.map((e: any) => e.reason?.message || e.reason),
    );
  }
}

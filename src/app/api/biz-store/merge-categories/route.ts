import { NextResponse } from "next/server";
import { queryRows, executeStmt } from "@/lib/db-mysql";

/**
 * POST /api/biz-store/merge-categories
 * 
 * Body: { table: string, column: string, fromValue: string, toValue: string }
 *
 * Merges category values: replaces all records where `column` = `fromValue` with `toValue`.
 * Supports: a3s_suppliers.category, a3s_materials.category, a3s_expenses.expense_type,
 *           a3s_cash_entries.category, a3s_income.category
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { table, column, fromValue, toValue } = body;

    if (!table || !column || !fromValue || !toValue) {
      return NextResponse.json({ ok: false, error: "缺少必要参数: table, column, fromValue, toValue" }, { status: 400 });
    }

    if (fromValue === toValue) {
      return NextResponse.json({ ok: false, error: "源类别和目标类别相同，无需合并" }, { status: 400 });
    }

    // 安全检查：只允许已知的表和列
    const allowedTables: Record<string, string[]> = {
      "a3s_suppliers": ["category"],
      "a3s_materials": ["category"],
      "a3s_expenses": ["expense_type"],
      "a3s_cash_entries": ["category"],
      "a3s_misc_income": ["category"],   // fallback for income
    };

    if (!allowedTables[table] || !allowedTables[table].includes(column)) {
      return NextResponse.json({ ok: false, error: `不允许的表/列组合: ${table}.${column}` }, { status: 400 });
    }

    // Count affected rows first
    const countSql = `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`${column}\` = ?`;
    const [countRows] = await queryRows(countSql, [fromValue]);
    const affected = Number(countRows?.cnt || 0);

    // Execute update
    const updateSql = `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`;
    await executeStmt(updateSql, [toValue, fromValue]);

    return NextResponse.json({
      ok: true,
      affected,
      table,
      column,
      fromValue,
      toValue,
      message: `已将 ${fromValue} → ${toValue}（影响 ${affected} 条记录）`,
    });
  } catch (err: any) {
    console.error("merge-categories error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}

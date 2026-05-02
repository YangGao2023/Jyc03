import { NextResponse } from "next/server";
import { executeStmt, queryRows } from "@/lib/db-mysql";
import { invalidateBizStoreCache } from "@/lib/biz-store";

// PUT /api/attendance
// Body: { employee_id, date, leave_minutes, overtime_minutes, meal_allowance }
// Upserts a single attendance record for the given employee+date.
// Deletes all existing rows for that employee+date first, then inserts the new one.
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { employee_id, date, leave_minutes = 0, overtime_minutes = 0, meal_allowance = false } = body;

    if (!employee_id || !date) {
      return NextResponse.json({ ok: false, error: "employee_id and date required" }, { status: 400 });
    }

    // Get employee info for denormalization
    const [emp] = await queryRows(
      "SELECT id, name, code FROM a3s_employees WHERE id = ? LIMIT 1",
      [employee_id],
    ) as { id: string; name: string; code: string }[];

    if (!emp) {
      return NextResponse.json({ ok: false, error: "employee not found" }, { status: 404 });
    }

    const defaultMinutes = 600;
    const workedMinutes = Math.max(0, defaultMinutes + overtime_minutes - leave_minutes);
    const id = `ATT-${date.replaceAll("-", "")}-${emp.code || employee_id}`;

    // Delete all existing rows for this employee+date (handles duplicates cleanly)
    await executeStmt(
      "DELETE FROM a3s_attendances WHERE employee_id = ? AND date = ?",
      [employee_id, date],
    );

    // Clear server-side cache so next GET returns fresh data
    invalidateBizStoreCache();

    // Insert the updated record
    await executeStmt(
      `INSERT INTO a3s_attendances
        (id, date, employee_id, employee_name, employee_code, worked_minutes, leave_minutes, overtime_minutes, meal_allowance, generated_by, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', '手工修改')`,
      [id, date, employee_id, emp.name, emp.code || null, workedMinutes, leave_minutes, overtime_minutes, meal_allowance ? 1 : 0],
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/attendance]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

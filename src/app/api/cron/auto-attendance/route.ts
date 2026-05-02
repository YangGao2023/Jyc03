import { NextResponse } from "next/server";

function secret() {
  return process.env.CRON_SECRET || "";
}

function nowInTimezone(tz: string): { date: string; time: string; weekday: string } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }); // HH:mm
  const weekday = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }); // Mon/Tue/...
  return { date, time, weekday };
}

function parseWorkdays(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {}
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const s = secret();
    if (!s) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
    if ((request.headers.get("authorization") || "") !== `Bearer ${s}`)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { queryRows, executeStmt } = await import("@/lib/db-mysql");

    // 读取设置
    const settingsRows = await queryRows("SELECT * FROM a3s_settings WHERE id = 1");
    if (!settingsRows.length) return NextResponse.json({ ok: false, error: "Settings not found" }, { status: 500 });

    const r = settingsRows[0] as Record<string, unknown>;
    const tz = String(r.auto_attendance_timezone || "America/New_York");
    const defaultMinutes = Number(r.auto_attendance_default_minutes || 600);
    const note = String(r.auto_attendance_note || "");
    const runTime = String(r.auto_attendance_run_time || "");

    if (!runTime) return NextResponse.json({ ok: false, message: "Auto attendance disabled (run_time empty)" });

    const { date: localDate, weekday } = nowInTimezone(tz);
    const employees = await queryRows("SELECT id, code, name, workdays, meal_allowance_eligible FROM a3s_employees WHERE status = '在职'");
    const todayStr = localDate.replace(/-/g, "");
    let created = 0;
    let skipped = 0;
    let skippedOffday = 0;

    for (const emp of employees) {
      const eid = String(emp.id);
      const code = String(emp.code || "");
      const name = String(emp.name || "");
      const workdays = parseWorkdays(emp.workdays);
      const isWorkday = workdays.length ? workdays.includes(weekday) : true;
      if (!isWorkday) {
        skippedOffday++;
        continue;
      }

      const exists = await queryRows("SELECT id FROM a3s_attendances WHERE employee_id = ? AND date = ? AND (note IS NULL OR note <> '__deleted__') LIMIT 1", [eid, localDate]);
      if (exists.length > 0) { skipped++; continue; }

      await executeStmt(
        "INSERT INTO a3s_attendances (id, date, employee_id, employee_name, employee_code, worked_minutes, leave_minutes, overtime_minutes, meal_allowance, generated_by, note) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'auto', ?)",
        [`ATT-${todayStr}-${code || eid}`, localDate, eid, name, code || null, defaultMinutes, defaultMinutes > 300 && Boolean(emp.meal_allowance_eligible ?? true) ? 1 : 0, note || null]
      );
      created++;
    }

    return NextResponse.json({ ok: true, date: localDate, weekday, timezone: tz, employees_total: employees.length, created, skipped, skippedOffday });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Auto attendance failed" }, { status: 500 });
  }
}

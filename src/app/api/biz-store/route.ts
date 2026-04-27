import { NextResponse } from "next/server";
import { createStoreRevision, readBizStore, writeBizStore, type BizStoreSnapshot } from "@/lib/biz-store";

export async function GET() {
  const data = await readBizStore();
  return NextResponse.json({ ok: true, data });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<BizStoreSnapshot>;
  const current = await readBizStore();

  if (typeof body.revision !== "string" || body.revision !== current.revision) {
    return NextResponse.json(
      { ok: false, code: "REVISION_CONFLICT", currentRevision: current.revision },
      { status: 409 },
    );
  }

  const next: BizStoreSnapshot = {
    revision: createStoreRevision(),
    orders: Array.isArray(body.orders) ? body.orders : current.orders,
    clients: Array.isArray(body.clients) ? body.clients : current.clients,
    suppliers: Array.isArray(body.suppliers) ? body.suppliers : current.suppliers,
    expenses: Array.isArray(body.expenses) ? body.expenses : current.expenses,
    cashEntries: Array.isArray(body.cashEntries) ? body.cashEntries : current.cashEntries,
    materials: Array.isArray(body.materials) ? body.materials : current.materials,
    purchases: Array.isArray(body.purchases) ? body.purchases : current.purchases,
    employees: Array.isArray(body.employees) ? body.employees : current.employees,
    attendances: Array.isArray(body.attendances) ? body.attendances : current.attendances,
    appointments: Array.isArray(body.appointments) ? body.appointments : current.appointments,
    payrolls: Array.isArray(body.payrolls) ? body.payrolls : current.payrolls,
    quotes: Array.isArray(body.quotes) ? body.quotes : current.quotes,
    showcases: Array.isArray(body.showcases) ? body.showcases : current.showcases,
    printArchives: Array.isArray(body.printArchives) ? body.printArchives : current.printArchives,
    settings: body.settings ?? current.settings,
  };

  await writeBizStore(next);
  return NextResponse.json({ ok: true, data: await readBizStore() });
}

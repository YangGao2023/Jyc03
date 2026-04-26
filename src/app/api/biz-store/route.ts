import { NextResponse } from "next/server";
import { readBizStore, writeBizStore, type BizStoreSnapshot } from "@/lib/biz-store";

export async function GET() {
  return NextResponse.json({ ok: true, data: readBizStore() });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<BizStoreSnapshot>;
  const current = readBizStore();

  const next: BizStoreSnapshot = {
    orders: Array.isArray(body.orders) ? body.orders : current.orders,
    clients: Array.isArray(body.clients) ? body.clients : current.clients,
    suppliers: Array.isArray(body.suppliers) ? body.suppliers : current.suppliers,
    expenses: Array.isArray(body.expenses) ? body.expenses : current.expenses,
    cashEntries: Array.isArray(body.cashEntries) ? body.cashEntries : current.cashEntries,
    materials: Array.isArray(body.materials) ? body.materials : current.materials,
    purchases: Array.isArray(body.purchases) ? body.purchases : current.purchases,
    employees: Array.isArray(body.employees) ? body.employees : current.employees,
    payrolls: Array.isArray(body.payrolls) ? body.payrolls : current.payrolls,
    quotes: Array.isArray(body.quotes) ? body.quotes : current.quotes,
    showcases: Array.isArray(body.showcases) ? body.showcases : current.showcases,
    settings: body.settings ?? current.settings,
  };

  writeBizStore(next);
  return NextResponse.json({ ok: true, data: next });
}

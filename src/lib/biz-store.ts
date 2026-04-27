import { kv } from "@vercel/kv";
import seedOrders from "../data/biz-orders.json";
import seedAssets from "../data/biz-assets.json";
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

const KV_KEY = "biz-store";

function buildSeedSnapshot(): BizStoreSnapshot {
  const assets = (seedAssets ?? {}) as Record<string, unknown>;

  return {
    orders: Array.isArray(seedOrders) ? (seedOrders as BizOrder[]) : [],
    clients: Array.isArray(assets.clients) ? (assets.clients as ContactRecord[]) : [],
    suppliers: Array.isArray(assets.suppliers) ? (assets.suppliers as SupplierRecord[]) : [],
    expenses: Array.isArray(assets.expenses) ? (assets.expenses as ExpenseRecord[]) : [],
    cashEntries: Array.isArray(assets.cash_entries) ? (assets.cash_entries as CashEntry[]) : [],
    materials: Array.isArray(assets.materials) ? (assets.materials as MaterialRecord[]) : [],
    purchases: Array.isArray(assets.purchases) ? (assets.purchases as PurchaseRecord[]) : [],
    employees: Array.isArray(assets.employees) ? (assets.employees as EmployeeRecord[]) : [],
    attendances: Array.isArray(assets.attendances) ? (assets.attendances as AttendanceRecord[]) : [],
    appointments: Array.isArray(assets.appointments) ? (assets.appointments as MeasurementAppointmentRecord[]) : [],
    payrolls: Array.isArray(assets.payrolls) ? (assets.payrolls as PayrollRecord[]) : [],
    quotes: Array.isArray(assets.quotes) ? (assets.quotes as QuoteRecord[]) : [],
    showcases: Array.isArray(assets.showcases) ? (assets.showcases as ShowcaseRecord[]) : [],
    printArchives: Array.isArray(assets.print_archives) ? (assets.print_archives as PrintArchiveRecord[]) : [],
    settings: ((assets.settings ?? {}) as BizSettings),
  };
}

const seed = buildSeedSnapshot();

export async function readBizStore(): Promise<BizStoreSnapshot> {
  try {
    const stored = await kv.get<BizStoreSnapshot>(KV_KEY);
    if (stored) return stored;
  } catch {
    // fall through to seed
  }

  // First time: seed and persist
  try {
    await kv.set(KV_KEY, seed);
  } catch {
    // best-effort seed persist
  }
  return seed;
}

export async function writeBizStore(snapshot: BizStoreSnapshot): Promise<void> {
  try {
    await kv.set(KV_KEY, snapshot);
  } catch (err) {
    console.error("[biz-store] redis write failed", err);
  }
}

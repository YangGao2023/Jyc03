import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import seedOrders from "../data/biz-orders.json";
import seedAssets from "../data/biz-assets.json";
import type {
  BizSettings,
  BizOrder,
  CashEntry,
  ContactRecord,
  EmployeeRecord,
  ExpenseRecord,
  MaterialRecord,
  PayrollRecord,
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
  payrolls: PayrollRecord[];
  quotes: QuoteRecord[];
  showcases: ShowcaseRecord[];
  settings: BizSettings;
};

const STORE_DIR = path.join(process.cwd(), "state");
const STORE_PATH = path.join(STORE_DIR, "biz-store.json");

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
    payrolls: Array.isArray(assets.payrolls) ? (assets.payrolls as PayrollRecord[]) : [],
    quotes: Array.isArray(assets.quotes) ? (assets.quotes as QuoteRecord[]) : [],
    showcases: Array.isArray(assets.showcases) ? (assets.showcases as ShowcaseRecord[]) : [],
    settings: ((assets.settings ?? {}) as BizSettings),
  };
}

function ensureStoreDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function readBizStore(): BizStoreSnapshot {
  ensureStoreDir();

  if (!existsSync(STORE_PATH)) {
    const seed = buildSeedSnapshot();
    writeBizStore(seed);
    return seed;
  }

  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as BizStoreSnapshot;
  } catch {
    const seed = buildSeedSnapshot();
    writeBizStore(seed);
    return seed;
  }
}

export function writeBizStore(snapshot: BizStoreSnapshot) {
  ensureStoreDir();
  writeFileSync(STORE_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

export { STORE_PATH as BIZ_STORE_PATH };

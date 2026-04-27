import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, "../src/app/dashboard/biz/page.tsx");
let src = readFileSync(filePath, "utf8");
const NL = src.includes("\r\n") ? "\r\n" : "\n";

// ── 1. State declarations ──────────────────────────────────────────────────
const STATE_ANCHOR = `const [auditReport, setAuditReport] = useState<FinanceAuditReport | null>(null);`;
if (!src.includes(STATE_ANCHOR)) {
  console.error("STATE_ANCHOR not found"); process.exit(1);
}
if (!src.includes("const [quickPayTarget")) {
  src = src.replace(
    STATE_ANCHOR,
    STATE_ANCHOR +
      NL + `  const [quickPayTarget, setQuickPayTarget] = useState<string | null>(null);` +
      NL + `  const [quickPayFields, setQuickPayFields] = useState({ date: today, amount: "", method: "现金", note: "" });`
  );
  console.log("✓ State declarations added.");
} else {
  console.log("State already present.");
}

// ── 2. handleQuickPay function ─────────────────────────────────────────────
const FUNC_END = `    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));${NL}  }`;
if (!src.includes(FUNC_END)) {
  // Try with just \n
  const FUNC_END2 = `    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));\n  }`;
  if (!src.includes(FUNC_END2)) {
    console.error("FUNC_END not found"); process.exit(1);
  }
}

const HANDLER = NL + NL +
`  function handleQuickPay(orderNumber: string) {` + NL +
`    const amount = parseFloat(quickPayFields.amount);` + NL +
`    if (!amount || amount <= 0) return;` + NL +
`    const newRecord: PaymentRecord = {` + NL +
`      date: quickPayFields.date,` + NL +
`      amount,` + NL +
`      method: quickPayFields.method,` + NL +
`      note: quickPayFields.note || undefined,` + NL +
`      type: "payment",` + NL +
`    };` + NL +
`    setOrders((prev) =>` + NL +
`      prev.map((o) => {` + NL +
`        if (o.order_number !== orderNumber) return o;` + NL +
`        const nextHistory = [newRecord, ...(o.payment_history ?? [])];` + NL +
`        const nextPaid = Number(((o.amount_paid ?? 0) + amount).toFixed(2));` + NL +
`        const total = o.total_after_tax ?? o.total_price ?? 0;` + NL +
`        const nextBalance = Math.max(0, Number((total - nextPaid).toFixed(2)));` + NL +
`        const nextStatus = deriveStatus(total, nextPaid, o.status ?? "下单");` + NL +
`        return { ...o, payment_history: nextHistory, amount_paid: nextPaid, balance: nextBalance, status: nextStatus };` + NL +
`      }),` + NL +
`    );` + NL +
`    setQuickPayTarget(null);` + NL +
`    setQuickPayFields({ date: today, amount: "", method: "现金", note: "" });` + NL +
`  }`;

if (!src.includes("function handleQuickPay(")) {
  // Insert after applyFinanceRepair closing brace
  const anchor = src.includes(FUNC_END) ? FUNC_END :
    `    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));\n  }`;
  src = src.replace(anchor, anchor + HANDLER);
  console.log("✓ handleQuickPay function added.");
} else {
  console.log("handleQuickPay already present.");
}

writeFileSync(filePath, src, "utf8");
console.log("All done.");

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, "../src/app/dashboard/biz/page.tsx");
let src = readFileSync(filePath, "utf8");

// 1. Add state declarations after [auditReport, setAuditReport]
const STATE_ANCHOR = `  const [auditReport, setAuditReport] = useState<FinanceAuditReport | null>(null);`;
if (!src.includes(STATE_ANCHOR)) {
  // Check if already added
  if (src.includes("quickPayTarget")) {
    console.log("State already present, skipping.");
  } else {
    console.error("STATE_ANCHOR not found!"); process.exit(1);
  }
} else if (!src.includes("quickPayTarget")) {
  src = src.replace(
    STATE_ANCHOR,
    STATE_ANCHOR + `
  const [quickPayTarget, setQuickPayTarget] = useState<string | null>(null);
  const [quickPayFields, setQuickPayFields] = useState({ date: today, amount: "", method: "现金", note: "" });`
  );
  console.log("State declarations added.");
} else {
  console.log("State already present.");
}

// 2. Add handleQuickPay function after applyFinanceRepair
const FUNC_ANCHOR = `  function applyFinanceRepair() {
    const repaired = applyFinanceAuditRepairs(orders, clients);
    setOrders(repaired.fixedOrders);
    setClients(repaired.fixedClients);
    setAuditReport(buildFinanceAuditReport(repaired.fixedOrders, repaired.fixedClients));
  }`;

const NEW_FUNC = `

  function handleQuickPay(orderNumber: string) {
    const amount = parseFloat(quickPayFields.amount);
    if (!amount || amount <= 0) return;
    const newRecord: PaymentRecord = {
      date: quickPayFields.date,
      amount,
      method: quickPayFields.method,
      note: quickPayFields.note || undefined,
      type: "payment",
    };
    setOrders((prev) =>
      prev.map((o) => {
        if (o.order_number !== orderNumber) return o;
        const nextHistory = [newRecord, ...(o.payment_history ?? [])];
        const nextPaid = Number(((o.amount_paid ?? 0) + amount).toFixed(2));
        const total = o.total_after_tax ?? o.total_price ?? 0;
        const nextBalance = Math.max(0, Number((total - nextPaid).toFixed(2)));
        const nextStatus = deriveStatus(total, nextPaid, o.status ?? "下单");
        return { ...o, payment_history: nextHistory, amount_paid: nextPaid, balance: nextBalance, status: nextStatus };
      }),
    );
    setQuickPayTarget(null);
    setQuickPayFields({ date: today, amount: "", method: "现金", note: "" });
  }`;

if (!src.includes("function handleQuickPay")) {
  if (!src.includes(FUNC_ANCHOR)) {
    console.error("FUNC_ANCHOR not found!"); process.exit(1);
  }
  src = src.replace(FUNC_ANCHOR, FUNC_ANCHOR + NEW_FUNC);
  console.log("handleQuickPay function added.");
} else {
  console.log("handleQuickPay already present.");
}

writeFileSync(filePath, src, "utf8");
console.log("All done.");

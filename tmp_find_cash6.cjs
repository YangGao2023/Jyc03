const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
// Before the cash section table, find allIncomeRows computation
const preTable = c.substring(cash, cash + 19000);
// Find the line or block that defines allIncomeRows
// Look for const allIncomeRows or let allIncomeRows
const idx = preTable.lastIndexOf('allIncomeRows');
console.log('Last allIncomeRows index:', idx);
if (idx >= 0) {
  console.log('Context (back 500):');
  console.log(preTable.substring(Math.max(0, idx - 500), idx));
  console.log('=== AT ===');
  console.log(preTable.substring(idx, idx + 500));
}

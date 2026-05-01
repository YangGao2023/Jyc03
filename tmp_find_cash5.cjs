const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);

// Find the calculation of allIncomeRows - search for various patterns
const patterns = [
  'allIncomeRows', 'bizCashEntries', 'transfer', 'Transfer',
  'officeTransfer', 'OfficeTransfer', 'a3s_office_transfers',
  'incomeRows', 'sortedIncome',
];
for (const p of patterns) {
  const idx = section.indexOf(p);
  if (idx >= 0) {
    console.log('=== ' + p + ' at offset', idx, '===');
    // Show more context
    console.log(section.substring(Math.max(0, idx - 50), Math.min(section.length, idx + 400)));
    console.log('---');
  }
}

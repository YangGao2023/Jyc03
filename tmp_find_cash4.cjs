const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);

// Find allIncomeRows definition
const idx = section.indexOf('allIncomeRows');
if (idx < 0) {
  console.log('allIncomeRows not found in range');
} else {
  console.log('=== allIncomeRows context ===');
  console.log(section.substring(idx - 100, idx + 1000));
}

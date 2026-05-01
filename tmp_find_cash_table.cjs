const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = 190229;
// After the income table (sub=income), find sub=cash render
const incomeEnd = c.lastIndexOf('</tbody>', cash + 15000);
console.log('Income table ends at', incomeEnd);
// Find the cash table after income table
const afterIncome = c.substring(incomeEnd, incomeEnd + 30000);
const cashTable = afterIncome.indexOf('<table', 2000);
if (cashTable >= 0) {
  const tableEnd = afterIncome.indexOf('</table>', cashTable);
  console.log('Cash table at offset', cashTable, 'length', tableEnd - cashTable);
  console.log('First 500 chars:');
  console.log(afterIncome.substring(cashTable, cashTable + 500));
}

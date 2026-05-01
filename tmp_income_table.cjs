const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
// Get the income table headers (before the cash section)
const incomeTableStart = cash + 18228;
const incomeTableEnd = c.indexOf('</table>', incomeTableStart);
const incomeTable = c.substring(incomeTableStart, incomeTableEnd + 8);
console.log('=== Income Table ===');
console.log(incomeTable);

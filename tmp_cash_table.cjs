const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const tableStart = cash + 24453;
const tableEnd = c.indexOf('</table>', tableStart);
console.log('=== Office Cash Table ===');
console.log(c.substring(tableStart, tableEnd + 8));

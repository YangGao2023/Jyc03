const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
// Find ALL occurrences of allIncomeRows
let pos = 0;
let count = 0;
while (true) {
  const idx = c.indexOf('allIncomeRows', pos);
  if (idx < 0) break;
  console.log('--- Match', ++count, 'at', idx, '---');
  console.log(c.substring(Math.max(0, idx - 80), Math.min(c.length, idx + 150)));
  pos = idx + 1;
}

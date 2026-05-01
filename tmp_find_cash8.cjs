const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const idx = 165710; // Position of allIncomeRows definition
console.log('=== allIncomeRows definition ===');
console.log(c.substring(idx - 50, idx + 2000));
console.log('...');
// Show more if truncated
const end = c.indexOf('];', idx + 500);
if (end > 0) {
  console.log(c.substring(idx, end + 2));
}

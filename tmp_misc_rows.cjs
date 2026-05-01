const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find filteredMiscIncomeRows definition
const idx = c.indexOf('filteredMiscIncomeRows');
if (idx < 0) {
  console.log('not found');
} else {
  console.log(c.substring(idx - 2, idx + 150));
}

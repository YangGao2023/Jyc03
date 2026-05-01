const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const idx = c.indexOf('miscIncomeRows');
if (idx >= 0) {
  const def = c.substring(Math.max(0, idx - 10), idx + 150);
  console.log(def);
}

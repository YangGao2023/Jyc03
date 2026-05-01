const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
// Find monthly/annual balance references
const patterns = ['月度', '年度', 'month', 'year', '年累计', '月'];
patterns.forEach(p => {
  let pos = 0;
  while (true) {
    const idx = c.indexOf(p, pos);
    if (idx < 0) break;
    console.log(p, 'at', idx, ':', c.substring(Math.max(0, idx - 30), idx + 50));
    pos = idx + 1;
  }
});

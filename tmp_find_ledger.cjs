const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('ledgerRows') || l.includes('ledgerView') || l.includes('monthly') && l.includes('cashEntries')) {
    console.log('Line', i + 1, ':', l.trim().substring(0, 200));
  }
});

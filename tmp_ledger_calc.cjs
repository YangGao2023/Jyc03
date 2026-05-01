const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find ledger section calculation
const idx = c.indexOf('ledgerRows');
if (idx >= 0) {
  const start = c.lastIndexOf('const ledgerRows', idx);
  let end = idx + 2000;
  let depth = 0;
  let braceFound = false;
  for (let i = start; i < Math.min(start + 3000, c.length); i++) {
    if (c[i] === '{') { if (!braceFound) { braceFound = true; depth = 0; } depth++; }
    else if (c[i] === '}') { depth--; if (braceFound && depth === 0) { end = i + 1; break; } }
  }
  console.log(c.substring(start, end));
}

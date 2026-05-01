const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const colsIdx = c.indexOf('const cols =', cash);
if (colsIdx >= 0) {
  const semi = c.indexOf(';', colsIdx);
  console.log('Cash cols:');
  console.log(c.substring(colsIdx, semi + 1));
}

const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 30000);
// Find table rendering
const tableIdx = section.indexOf('<table');
if (tableIdx >= 0) {
  console.log('TABLE at local offset', tableIdx);
  console.log('---');
  console.log(section.substring(tableIdx, tableIdx + 300));
  console.log('---');
}
// Find where individual entries are rendered (.map on sortedCash or similar)
const pattern = /\.map\(\(([a-z]+,)?([a-z]+)\)\s*=>/g;
let m;
let found = 0;
while ((m = pattern.exec(section)) !== null && found < 5) {
  console.log('.map at', m.index, ':', section.substring(m.index, m.index + 200));
  found++;
}

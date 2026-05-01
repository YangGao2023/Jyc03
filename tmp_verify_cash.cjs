const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
// Find the cash sub-section and get its table headers
const cash = c.indexOf('sub === "cash"');
// Find the table after "办公室余额"
const bal = c.indexOf('办公室余额', cash);
const tableStart = c.indexOf('<table', bal);
const theadEnd = c.indexOf('</thead>', tableStart);
console.log('Cash table headers:');
console.log(c.substring(tableStart, theadEnd));

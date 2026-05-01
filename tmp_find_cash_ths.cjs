const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = 190229;
const section = c.substring(cash, cash + 20000);
// Find the cash table - look for the office/new cash flow table
let pos = 0;
let count = 0;
while (true) {
  const idx = section.indexOf('<th', pos);
  if (idx < 0 || count >= 15) break;
  const openB = section.indexOf('>', idx);
  const close = section.indexOf('</th>', idx);
  const content = section.substring(openB + 1, close);
  console.log('th', ++count, JSON.stringify(content));
  pos = close + 5;
}

const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 5000);
// Find cols or table headers
let pos = 0;
const matches = [];
while (true) {
  const idx = section.indexOf('<th', pos);
  if (idx < 0) break;
  const end = section.indexOf('</th>', idx);
  const content = section.substring(section.indexOf('>', idx) + 1, end);
  matches.push(content);
  pos = end + 5;
}
console.log('All <th> in cash section:', matches.join(' | '));
// Also find the cols array/let
const arr = section.match(/col[s]?[^=]*=[^;]+;/);
if (arr) console.log('cols declaration:', arr[0]);

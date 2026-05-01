const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 15000);
// Find ALL <th> occurrences regardless
let pos = 0;
let count = 0;
while (true) {
  const idx = section.indexOf('<th', pos);
  if (idx < 0 || count >= 20) break;
  const end = section.indexOf('</th>', idx);
  const openBracket = section.indexOf('>', idx);
  const content = section.substring(openBracket + 1, end);
  console.log('th', ++count, 'at', idx, ':', JSON.stringify(content));
  pos = end + 5;
}

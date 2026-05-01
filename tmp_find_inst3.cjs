const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find section rendering switches  
let pos = 0;
let count = 0;
while (true) {
  const idx = c.indexOf('section === ', pos);
  if (idx < 0) break;
  const lineEnd = c.indexOf('\n', idx);
  const line = c.substring(idx, lineEnd).trim();
  console.log(line);
  count++;
  pos = idx + 1;
}
console.log('Total:', count);

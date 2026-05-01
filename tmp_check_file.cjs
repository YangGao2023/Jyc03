const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
console.log('File size:', c.length);
console.log('Contains sub === "cash":', c.includes('sub === "cash"'));
console.log('Contains 办公室:', c.includes('办公室'));
// Count occurrences
let count = 0;
let pos = 0;
while (true) {
  const idx = c.indexOf('办公室', pos);
  if (idx < 0) break;
  count++;
  pos = idx + 1;
}
console.log('办公室 occurrences:', count);

// Find sub === "cash" and show context
const idx = c.indexOf('sub === "cash"');
if (idx >= 0) {
  console.log('Cash section at', idx, ':');
  console.log(c.substring(idx, idx + 200));
}

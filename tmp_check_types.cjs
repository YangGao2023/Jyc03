const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
// Find all remaining "类型" as th headers
const regex = /<th[^>]*>\u7c7b\u578b<\/th>/g;
let m;
let i = 0;
while ((m = regex.exec(c)) !== null && i < 10) {
  console.log('Match', ++i, 'at', m.index, ':');
  console.log(c.substring(Math.max(0, m.index - 50), m.index + 30));
}

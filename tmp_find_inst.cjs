const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
let i = 0;
let cnt = 0;
while ((i = c.indexOf('installItem', i + 1)) >= 0 && cnt < 10) {
  cnt++;
  const lineNo = c.substring(0, i).split('\n').length;
  const start = Math.max(0, i - 30);
  console.log('#' + cnt + ' line=' + lineNo + ': ' + c.substring(start, i + 100));
}
if (cnt === 0) console.log('not found');

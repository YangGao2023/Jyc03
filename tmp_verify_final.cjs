const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const t = c.indexOf('日期</th>', cash);
if (t >= 0) console.log(JSON.stringify(c.substring(t - 30, t + 200)));

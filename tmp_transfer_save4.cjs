const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);
// Find the primary button in the transfer modal
const primaryBtn = section.indexOf('tone="primary"', section.indexOf('办公室转入 / 转出'));
if (primaryBtn < 0) {
  console.log('primary button not found');
  process.exit();
}
const handler = section.substring(primaryBtn, primaryBtn + 500);
console.log('=== Primary button ===');
console.log(handler);

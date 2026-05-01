const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);
// Find the transfer modal save button
const saveBtn = section.indexOf('办公室转入 / 转出');
const afterModal = section.substring(saveBtn, saveBtn + 5000);
const btnIdx = afterModal.indexOf('onClick');
if (btnIdx >= 0) {
  const handler = afterModal.substring(btnIdx, btnIdx + 800);
  console.log('=== onClick handler ===');
  console.log(handler);
}

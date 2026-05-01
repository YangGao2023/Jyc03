const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);
const idx = section.indexOf('setShowOfficeTransferModal(false)');
console.log('=== Transfer save handler (back 600 chars) ===');
const handler = section.substring(Math.max(0, idx - 600), idx + 100);
console.log(handler);

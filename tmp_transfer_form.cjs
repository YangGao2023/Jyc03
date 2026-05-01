const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 20000);

// Find the transfer form/modal
const idx = section.indexOf('转出"');
if (idx >= 0) {
  console.log('=== Transfer draft fields ===');
  // Find the officeTransferDraft definition/initialization
  const init = section.lastIndexOf('officeTransferDraft', idx);
  if (init >= 0) {
    console.log(section.substring(Math.max(0, init - 100), Math.min(section.length, init + 800)));
  } else {
    console.log(section.substring(Math.max(0, idx - 300), idx + 200));
  }
}

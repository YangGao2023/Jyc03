const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the office transfer save handler
const idx = c.indexOf('showOfficeTransferModal');
// Search backward for the save function
const saveIdx = c.lastIndexOf('function addOfficeTransfer', idx);
if (saveIdx < 0) {
  // Try inline handler
  const btn = c.indexOf('handleAddOfficeTransfer');
  if (btn >= 0) {
    console.log(c.substring(btn - 50, btn + 500));
  }
  console.log('addOfficeTransfer not found');
  process.exit();
}
console.log(c.substring(saveIdx, saveIdx + 1000));

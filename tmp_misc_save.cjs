const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find how misc income is saved
const miscSave = c.indexOf('handleAddMiscIncome');
// Also find the inline handler
const saveIdx = c.indexOf('setShowMiscIncomeModal(false)');
const ctx = c.substring(Math.max(0, saveIdx - 800), saveIdx + 100);
console.log('=== Misc income save handler ===');
console.log(ctx);

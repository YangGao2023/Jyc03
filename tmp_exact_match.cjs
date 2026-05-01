const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Print exact content around addOfficeTransfer
const idx = c.indexOf('function addOfficeTransfer');
const semi = c.indexOf(';', idx + 300);
console.log('=== EXACT function addOfficeTransfer ===');
console.log(JSON.stringify(c.substring(idx, semi + 50)));
console.log('\n=== EXACT form fields ===');
// Find the form date → note field area
const dateField = c.indexOf('officeTransferDraft.date');
const noteField = c.indexOf('officeTransferDraft.note', dateField);
console.log('Around date field:');
console.log(JSON.stringify(c.substring(dateField - 20, noteField + 100)));

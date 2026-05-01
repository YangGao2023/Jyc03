const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const idx = c.indexOf('addOfficeTransfer');
console.log('Content around addOfficeTransfer:');
console.log('---');
console.log(c.substring(idx - 5, idx + 1000));
console.log('---');
console.log('File has addOfficeTransfer:', c.includes('addOfficeTransfer'));
// Check the draft state definition
const draftIdx2 = c.indexOf('officeTransferDraft');
console.log('\nFirst officeTransferDraft context:');
console.log(c.substring(draftIdx2 - 5, draftIdx2 + 400));
// Check the form fields
const dateField = c.indexOf('officeTransferDraft.amount');
console.log('\nForm fields around amount:');
console.log(c.substring(dateField - 5, dateField + 500));

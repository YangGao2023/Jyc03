const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the transfer modal form fields (in JSX)
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 15000);
// Find the transfer form - search for "办公室转入 / 转出" title
const title = section.indexOf('办公室转入 / 转出');
const formArea = section.substring(title, title + 2000);
// Find SmallInput for note
const noteInput = formArea.indexOf('SmallInput value={officeTransferDraft.note}');
if (noteInput < 0) {
  console.log('note input not found');
  // Search for note in the transfer form
  const noteRef = formArea.indexOf('note');
  if (noteRef >= 0) {
    const ctx = formArea.substring(Math.max(0, noteRef - 50), noteRef + 100);
    console.log('note found at', noteRef, ':', JSON.stringify(ctx));
  }
  process.exit();
}
console.log('=== Note input area ===');
console.log(JSON.stringify(formArea.substring(Math.max(0, noteInput - 200), noteInput + 200)));

// Also print the exact Transfer form section with SmallInput/SmallSelect
const re = /<(SmallInput|SmallSelect)[^>]*officeTransferDraft[^>]*\/?>/g;
let m;
while ((m = re.exec(formArea)) !== null) {
  console.log('Form field:', m[0]);
}

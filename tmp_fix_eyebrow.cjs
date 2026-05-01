const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

const replacements = [
  ['eyebrow="Business Overview"', 'eyebrow="\u4e1a\u52a1\u603b\u89c8"'],
  ['eyebrow="Order Management"', 'eyebrow="\u8ba2\u5355\u7ba1\u7406"'],
  ['eyebrow="Finance Management"', 'eyebrow="\u6536\u652f\u7ba1\u7406"'],
  ['eyebrow="Install Info"', 'eyebrow="\u5b89\u88c5\u4fe1\u606f"'],
  ['eyebrow="Material"', 'eyebrow="\u7269\u6599\u7ba1\u7406"'],
  ['eyebrow="Employee"', 'eyebrow="\u5458\u5de5\u7ba1\u7406"'],
  ['eyebrow="Clients"', 'eyebrow="\u5ba2\u6237\u6863\u6848"'],
  ['eyebrow="Appointments"', 'eyebrow="\u91cf\u5c3a\u5bf8"'],
  ['eyebrow="Settings"', 'eyebrow="\u7cfb\u7edf\u8bbe\u7f6e"'],
  ['eyebrow="Owner Backend \u00b7 Business"', 'eyebrow="\u4e3b\u4eba\u540e\u53f0 \u00b7 \u4e1a\u52a1"'],
];

let modified = c;
let totalReplaced = 0;
for (const [oldStr, newStr] of replacements) {
  const count = (modified.match(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (count > 0) {
    console.log('Replacing:', oldStr, '->', newStr.substring(0, 40) + '...', '(', count, 'occurrences)');
    modified = modified.split(oldStr).join(newStr);
    totalReplaced++;
  }
}

fs.writeFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', modified, 'utf-8');
console.log('Done. Total replacement groups:', totalReplaced);

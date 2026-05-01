const fs = require('fs');
const file = 'C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx';
let c = fs.readFileSync(file, 'utf-8');

// Replace all \uXXXX escape sequences with actual characters
c = c.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
  return String.fromCharCode(parseInt(hex, 16));
});

fs.writeFileSync(file, c, 'utf-8');

// Verify the change
const cn = c.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
const escaped = c.match(/\\u[0-9a-f]{4}/g) || [];
console.log('After conversion:');
console.log('Chinese chars:', cn.length);
console.log('Remaining \\u escapes:', escaped.length);
console.log('File is clean:', escaped.length === 0);

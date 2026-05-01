const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Search for all u escape patterns
const pat1 = c.match(/[^a-zA-Z]\\u[0-9a-f]{4}/g) || [];
const pat2 = c.match(/\\u[0-9a-f]{4}/g) || [];
console.log('Double-escaped:', pat1.length, 'any:', pat2.length);
if (pat2.length > 0) {
  console.log('Examples:', pat2.slice(0, 5));
}

// Search for actual Chinese characters
const cn = c.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
console.log('Chinese chars in source:', cn.length);

// Search for specific strings
console.log('Has "Install Info":', c.includes('Install Info'));
console.log('Has "安装信息":', c.includes('安装信息'));

// Check the actual rendering code around Install Info
const ii = c.indexOf('Install Info');
if (ii >= 0) {
  console.log('Install Info context:', c.substring(Math.max(0, ii - 30), ii + 40));
}

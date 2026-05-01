const fs = require('fs');
const dir = 'C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.next/static/chunks';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => dir + '/' + f);
for (const f of files) {
  try {
    const s = fs.statSync(f).size;
    if (s < 10000) continue;
    const buf = Buffer.alloc(Math.min(s, 50000));
    const fd = fs.openSync(f, 'r');
    fs.readSync(fd, buf, 0, buf.length, Math.floor(s * 0.4));
    fs.closeSync(fd);
    const c = buf.toString('utf-8');
    const install = c.indexOf('安装信息');
    if (install >= 0) console.log(f.split('/').pop(), '- HAS 安装信息 ✓');
    const biz = c.indexOf('业务总览');
    if (biz >= 0) console.log('  also has 业务总览 ✓');
    const raw = c.indexOf('\\u5b89');
    if (raw >= 0) console.log('  WARNING: has raw \\u5b89 at', raw);
  } catch (e) { console.log(f, 'error:', e.message); }
}

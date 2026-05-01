const http = require('http');
http.get('http://100.107.63.82:3000/dashboard/biz', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    // Check for raw \u escapes that would show literally
    const re = /\\u[0-9a-f]{4}/gi;
    const m = d.match(re);
    console.log('Raw \\u escapes in HTML:', m ? m.length : 0);
    if (m && m.length > 0) console.log('First 5:', m.slice(0, 5));

    // Check for actual Chinese text
    const cn = d.match(/[\u4e00-\u9fff]+/g);
    console.log('Chinese chars found:', cn ? cn.length : 0);
    if (cn && cn.length > 5) console.log('First 5:', cn.slice(0, 5));

    // Check for eyebrow text
    console.log('Has 安装信息:', d.includes('安装信息'));
    console.log('Has 业务总览:', d.includes('业务总览'));
    console.log('Has Install Info:', d.includes('Install Info') && !d.includes('eyebrow'));
    console.log('HTML size:', d.length);
  });
});

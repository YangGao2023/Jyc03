// Migrate material data: extract category from remark, size from specification
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function put(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const { data } = await get('http://localhost:3300/api/biz-store');
  const materials = data.materials;
  let changed = 0;

  const migrated = materials.map((m) => {
    let mod = false;
    const result = { ...m };

    // 1. Extract category from remark ("类别:X" or "类别:X；")
    if (!result.category && result.remark) {
      const catMatch = result.remark.match(/类别[:：]\s*([^；;，,]+)/);
      if (catMatch) {
        result.category = catMatch[1].trim();
        mod = true;
      }
    }

    // 2. Extract size from specification ("28*25 | 5*5/16" → size="28*25", spec="5*5/16")
    if (!result.size && result.specification && result.specification.includes(' | ')) {
      const parts = result.specification.split(' | ');
      if (parts.length >= 2) {
        // Guess which part is size: usually contains * or x or numbers
        const sizePart = parts[0].trim();
        const specPart = parts.slice(1).join(' | ').trim();
        // Only extract if first part looks like a size (contains * or is purely dimensional)
        if (/[\d]+[\s]*[*xX][\s]*[\d]+/.test(sizePart)) {
          result.size = sizePart || undefined;
          result.specification = specPart || undefined;
          mod = true;
        }
      }
    }

    // 3. Also check specification for simple patterns like "28*25" (no pipe)
    if (!result.size && result.specification && !result.specification.includes(' | ')) {
      const sizeMatch = result.specification.match(/^(\d+(?:\.\d+)?[\s]*[*xX][\s]*\d+(?:\.\d+)?(?:[-/]\d+(?:\.\d+)?[\s]*[*xX][\s]*\d+(?:\.\d+)?)*)/);
      if (sizeMatch) {
        result.size = sizeMatch[1].trim();
        result.specification = result.specification.slice(sizeMatch[1].length).trim() || undefined;
        mod = true;
      }
    }

    if (mod) changed++;
    return result;
  });

  console.log(`Total materials: ${materials.length}`);
  console.log(`Modified: ${changed}`);

  // Stats after migration
  const cats = new Set(migrated.filter(m => m.category).map(m => m.category));
  const sizes = migrated.filter(m => m.size).length;
  console.log(`Categories now: ${cats.size} (${[...cats].join(', ')})`);
  console.log(`Sizes now: ${sizes}/${migrated.length}`);

  // Send update
  const putResult = await put('http://localhost:3300/api/biz-store', {
    revision: data.revision,
    materials: migrated,
  });

  console.log(`PUT result:`, putResult.ok ? 'OK' : 'FAILED', putResult.code || '');

  // Verify
  const { data: vdata } = await get('http://localhost:3300/api/biz-store');
  const vcats = new Set(vdata.materials.filter(m => m.category).map(m => m.category));
  const vsizes = vdata.materials.filter(m => m.size).length;
  console.log(`Verified - Categories: ${vcats.size}, Sizes: ${vsizes}/${vdata.materials.length}`);
}

main().catch(console.error);

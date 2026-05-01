const fs = require('fs');
let c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// 1. Update draft default
const oldDefault = 'const [officeTransferDraft, setOfficeTransferDraft] = useState({ type: "转入", amount: "", date: today, note: "" });';
const newDefault = 'const [officeTransferDraft, setOfficeTransferDraft] = useState({ type: "转入", amount: "", date: today, category: "", target_name: "", note: "" });';
if (c.includes(oldDefault)) {
  c = c.replace(oldDefault, newDefault);
  console.log('✅ draft default');
} else console.log('❌ draft default');

// 2. Update addOfficeTransfer function
const oldFn = `function addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: officeTransferDraft.type, amount, date: officeTransferDraft.date, method: OFFICE_PAYMENT_METHOD, note: officeTransferDraft.note || undefined, office: true, source_type: "office-transfer", source_id: \`\${officeTransferDraft.type}:\${officeTransferDraft.date}:\${amount}\` }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, note: "" });
    setShowOfficeTransferModal(false);
    onAutoSave?.();
  }`;

const newFn = `function addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    const category = officeTransferDraft.category || '';
    const target_name = officeTransferDraft.target_name || undefined;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: officeTransferDraft.type, amount, date: officeTransferDraft.date, category, target_name, method: OFFICE_PAYMENT_METHOD, note: officeTransferDraft.note || undefined, office: true, source_type: "office-transfer", source_id: \`\${officeTransferDraft.type}:\${officeTransferDraft.date}:\${amount}\` }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, category: "", target_name: "", note: "" });
    setShowOfficeTransferModal(false);
    onAutoSave?.();
  }`;

if (c.includes(oldFn)) {
  c = c.replace(oldFn, newFn);
  console.log('✅ addOfficeTransfer');
} else console.log('❌ addOfficeTransfer');

// 3. Add category and target_name fields to the form (before note field)
const oldForm = `              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注(可选)" />`;

const newForm = `              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallSelect value={officeTransferDraft.category} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, category: v }))} options={incomeCategories.length > 0 ? incomeCategories : ['杂项收入']} />
              <SmallInput value={officeTransferDraft.target_name} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, target_name: v }))} placeholder="对方(可选)" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注(可选)" />`;

if (c.includes(oldForm)) {
  c = c.replace(oldForm, newForm);
  console.log('✅ form fields');
} else console.log('❌ form fields');

// 4. Update cash table category render (already done in previous script, just verify)
const oldCatRender = `const typeCategory = item.category || (item.type === "转入" || item.type === "转出" ? "-" : "-");`;
// Check if it was already changed
if (c.includes('item.category || (item.type === "转入" || item.type === "转出" ? "-" : "-")')) {
  console.log('✅ category render already updated');
} else {
  const oldRender = `const typeCategory = item.type === "转入" || item.type === "转出" ? "-" : (item.category || "-");`;
  if (c.includes(oldRender)) {
    c = c.replace(oldRender, `const typeCategory = item.category || (item.type === "转入" || item.type === "转出" ? "-" : "-");`);
    console.log('✅ category render');
  } else console.log('❌ category render not found');
}

fs.writeFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', c, 'utf-8');
console.log('\nDone!');

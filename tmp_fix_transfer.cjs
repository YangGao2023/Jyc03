const fs = require('fs');
let c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// 1. Add category and target_name fields to the office transfer form and save handler
// Find the transfer form section and add category + target_name fields

// The save handler currently has category and target_name missing - need to add them
// Find the addOfficeTransfer function and add category, target_name
const oldAddOfficeTransfer = `addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: officeTransferDraft.type, amount, date: officeTransferDraft.date, method: OFFICE_PAYMENT_METHOD, note: officeTransferDraft.note || undefined, office: true, source_type: "office-transfer", source_id: \`\${officeTransferDraft.type}:\${officeTransferDraft.date}:\${amount}\` }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, note: "" });
    setShowOfficeTransferModal(false);
    onAutoSave?.();
  }`;

const newAddOfficeTransfer = `addOfficeTransfer() {
    const amount = Number(officeTransferDraft.amount) || 0;
    if (amount <= 0) return;
    const category = officeTransferDraft.category || '';
    const target_name = officeTransferDraft.target_name || undefined;
    setCashEntries((prev) => [{ id: nextYearScopedId(prev.map((item) => item.id), "CASH", new Date().getFullYear()), type: officeTransferDraft.type, amount, date: officeTransferDraft.date, category, target_name, method: OFFICE_PAYMENT_METHOD, note: officeTransferDraft.note || undefined, office: true, source_type: "office-transfer", source_id: \`\${officeTransferDraft.type}:\${officeTransferDraft.date}:\${amount}\` }, ...prev]);
    setOfficeTransferDraft({ type: "转入", amount: "", date: today, category: "", target_name: "", note: "" });
    setShowOfficeTransferModal(false);
    onAutoSave?.();
  }`;

// 2. Update the draft default to include category and target_name
const oldDraftDefault = `officeTransferDraft, setOfficeTransferDraft } = useState({ type: "转入" as const, amount: "", date: today, note: "" });`;
const newDraftDefault = `officeTransferDraft, setOfficeTransferDraft } = useState({ type: "转入" as const, amount: "", date: today, category: "", target_name: "", note: "" });`;

// 3. Add category and target_name fields to the transfer form
// Find the SmallInput for note and add before it
const oldFormFields = `              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注(可选)" />`;

const newFormFields = `              <SmallInput value={officeTransferDraft.date} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, date: v }))} type="date" />
              <SmallSelect value={officeTransferDraft.category} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, category: v }))} options={incomeCategories.length > 0 ? incomeCategories : ['杂项收入']} />
              <SmallInput value={officeTransferDraft.target_name} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, target_name: v }))} placeholder="对方(可选)" />
              <SmallInput value={officeTransferDraft.note} onChange={(v) => setOfficeTransferDraft((d) => ({ ...d, note: v }))} placeholder="备注(可选)" />`;

// 4. Fix the cash table to not force "-" for transfer category
const oldCategoryRender = `const typeCategory = item.type === "转入" || item.type === "转出" ? "-" : (item.category || "-");`;
const newCategoryRender = `const typeCategory = item.category || (item.type === "转入" || item.type === "转出" ? "-" : "-");`;

let modified = c;

// Apply replacements
if (modified.includes(oldAddOfficeTransfer)) {
  modified = modified.replace(oldAddOfficeTransfer, newAddOfficeTransfer);
  console.log('✅ Updated addOfficeTransfer');
} else {
  console.log('❌ addOfficeTransfer pattern not found');
}

if (modified.includes(oldDraftDefault)) {
  modified = modified.replace(oldDraftDefault, newDraftDefault);
  console.log('✅ Updated draft default');
} else {
  console.log('❌ draft default pattern not found');
  // Try alternative pattern
  const altDefault = `officeTransferDraft, setOfficeTransferDraft } = useState({ type: "转入" as const, amount: "", date: today, note: "" })`;
  if (modified.includes(altDefault)) {
    modified = modified.replace(altDefault, `officeTransferDraft, setOfficeTransferDraft } = useState({ type: "转入" as const, amount: "", date: today, category: "", target_name: "", note: "" })`);
    console.log('✅ Updated draft default (alt)');
  }
}

if (modified.includes(oldFormFields)) {
  modified = modified.replace(oldFormFields, newFormFields);
  console.log('✅ Updated form fields');
} else {
  console.log('❌ form fields pattern not found');
}

// Also update the cash table rendering - remove the hardcoded "-" for transfers
if (modified.includes(oldCategoryRender)) {
  modified = modified.replace(oldCategoryRender, newCategoryRender);
  console.log('✅ Updated cash table category render');
} else {
  console.log('❌ category render pattern not found');
}

fs.writeFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', modified, 'utf-8');
console.log('\nDone!');

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, "../src/app/dashboard/biz/page.tsx");
let src = readFileSync(filePath, "utf8");

const START = `      {sub === "receivables" && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2.5 font-semibold text-slate-600">客户</th>`;

const startIdx = src.indexOf(START);
if (startIdx === -1) { console.error("START not found"); process.exit(1); }

const TAIL = `</tbody></table></div>}`;
// Find the TAIL after startIdx, but we need to make sure it's the right one (for receivables)
// The receivables block ends before {sub === "audit"
const AFTER_MARKER = `      {sub === "audit"`;
const auditIdx = src.indexOf(AFTER_MARKER, startIdx);
const tailIdx = src.lastIndexOf(TAIL, auditIdx);
if (tailIdx === -1 || tailIdx < startIdx) { console.error("TAIL not found"); process.exit(1); }

const oldBlock = src.slice(startIdx, tailIdx + TAIL.length);
console.log("Old block length:", oldBlock.length);
console.log("Ends with:", oldBlock.slice(-50));

const newBlock = `      {sub === "receivables" && (
        <div className="space-y-3">
          {receivableOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">暂无未收款订单</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2.5 font-semibold text-slate-600">客户</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">订单号</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">总额</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">已付</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">余款</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">下单日期</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">账龄</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {receivableOrders.map((o) => {
                    const agingDays = diffReceivableDays(o.order_date);
                    const agingBucket = getReceivableBucket(agingDays);
                    const isExpanded = quickPayTarget === o.order_number;
                    return (
                      <>
                        <tr key={o.order_number} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-slate-700">{o.client_name}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-700">{o.order_number}</td>
                          <td className="px-4 py-2.5 text-slate-700">{formatMoney(o.total_after_tax ?? o.total_price ?? 0)}</td>
                          <td className="px-4 py-2.5 font-medium text-green-600">{formatMoney(o.amount_paid ?? 0)}</td>
                          <td className="px-4 py-2.5 font-semibold text-red-600">{formatMoney(o.balance ?? 0)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{o.order_date || "-"}</td>
                          <td className="px-4 py-2.5">
                            <span className={\`rounded-full border px-2 py-0.5 text-[11px] font-medium \${agingBucket.tone}\`}>
                              {agingDays}天
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  setQuickPayTarget(null);
                                } else {
                                  setQuickPayTarget(o.order_number);
                                  setQuickPayFields({ date: today, amount: String(o.balance ?? ""), method: "现金", note: "" });
                                }
                              }}
                              className={\`rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors \${isExpanded ? "border-slate-300 bg-slate-100 text-slate-600" : "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}\`}
                            >
                              {isExpanded ? "收起" : "收款"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={\`\${o.order_number}-qp\`} className="border-b border-emerald-100 bg-emerald-50/50">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="flex flex-wrap items-end gap-2">
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">日期</label>
                                  <input
                                    type="date"
                                    value={quickPayFields.date}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, date: e.target.value }))}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">金额 <span className="text-rose-500">*</span></label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="0.00"
                                    value={quickPayFields.amount}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, amount: e.target.value }))}
                                    className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">方式</label>
                                  <select
                                    value={quickPayFields.method}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, method: e.target.value }))}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  >
                                    {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div className="flex-1 min-w-[120px]">
                                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">备注</label>
                                  <input
                                    type="text"
                                    placeholder="可选"
                                    value={quickPayFields.note}
                                    onChange={(e) => setQuickPayFields((prev) => ({ ...prev, note: e.target.value }))}
                                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleQuickPay(o.order_number)}
                                    disabled={!quickPayFields.amount || Number(quickPayFields.amount) <= 0}
                                    className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    确认收款
                                  </button>
                                  <button
                                    onClick={() => setQuickPayTarget(null)}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:border-slate-400 transition-colors"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}`;

const result = src.slice(0, startIdx) + newBlock + src.slice(tailIdx + TAIL.length);
writeFileSync(filePath, result, "utf8");
console.log("Done! Replacement successful.");

# Progress Notes

Searchable log of notable improvements. Most recent first.

---

## 2026-04-26 — Order Material Readiness + Inventory Consumption Trace

**File:** `src/app/dashboard/biz/page.tsx` — `OrdersSection`, `OrderDetailView`, `MaterialsSection`

### What changed
This round made the link between **orders** and **materials / inventory** much more direct. Instead of only seeing a total occupied quantity in stock, users can now see whether a wholesale order can actually be prepared, and exactly which orders are consuming each material.

### New capabilities
- **订单列表新增“备料”状态** — wholesale orders now show `可直接备料` / `缺料 X 项` / `待建物料 X 项` / `未录物料`, so staff can judge readiness without opening each order.
- **缺料订单提醒卡** — the order list now surfaces orders that still need stock or material coding, with one click into the detail page.
- **订单详情新增“备料检查”** — inside a wholesale order, every material row now shows matched stock item, quantity needed, available stock before allocation, remaining stock after allocation, and shortage result.
- **库存表支持查看占用订单** — each material row can expand to show which orders are consuming it, how much each order needs, stock before/after that allocation, and whether that order causes a shortage.
- **库存页新增缺料订单看板** — warehouse-side users can directly see which orders are blocked by stock instead of reverse-checking order by order.

### Why it matters
Previously: users could see total order occupancy, but still had to mentally map inventory back to specific orders.
Now: users can directly answer three business questions in one screen, “这张单能不能备料”, “这个料被哪些订单占了”, and “到底先补哪一张单的料”.

## 2026-04-26 — Receivables Quick Pay + Aging Column

**File:** `src/app/dashboard/biz/page.tsx` — `FinanceSection` › `receivables` sub-tab

### What changed
The **应收款 (Receivables)** tab in Finance was previously read-only: it listed unpaid orders but offered no way to collect a payment without navigating to the full order detail view.

### New capabilities
- **账龄 (Aging days) column** — each row now shows a color-coded badge indicating how many days since the order date (0–30 days = green, 31–60 = amber, 61–90 = orange, 90+ = red), giving immediate priority visibility.
- **收款 (Quick Pay) button** — every row with an outstanding balance has a green "收款" button. Clicking it expands an inline form directly beneath that row.
- **Inline payment form** — pre-filled with today's date and the exact outstanding balance. User can adjust the date, amount, payment method (7 options), and an optional note, then click "确认收款" to instantly record the payment.
- On confirm: the payment record is appended to the order's `payment_history`, `amount_paid` / `balance` / `status` are recalculated and persisted — same logic as the full order detail form.
- The form collapses automatically after a successful submission.

### Why it matters
Previously: to record a final payment the user had to leave Finance → go to Orders → find the order → open detail → scroll to payment form → submit → navigate back.  
Now: stay in the Receivables view, click "收款", fill in the inline row, done in 3 seconds.

# Progress Notes

Searchable log of notable improvements. Most recent first.

---

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

# Biz migration progress

## 2026-04-26 - Orders bulk settlement and cleanup
- Migrated a real order-management workflow from the Base44 reference into `src/app/dashboard/biz/page.tsx`.
- Added bulk order selection, select-all for filtered rows, batch settle-tail-balance action, batch delete action, unpaid-customer reminder banner, expanded date filters (yesterday, last week, last month, custom range), and an unpaid-only quick filter.
- Validation: `npm run build` passed.

## 2026-04-26 - Order print archive loop
- Chose the next highest-value business gap after client overview: close the order print workflow so users can save printable slips, reprint later, and download archived HTML instead of printing once and losing the document.
- Added persistent `printArchives` support across `biz-data`, `biz-store`, and `/api/biz-store`.
- Upgraded the order detail page with save-invoice, print-and-archive invoice, save-pickup-sheet, print-and-archive pickup-sheet, plus an order-level print archive panel.
- Added an order-management print archive summary card so staff can quickly see today’s archived slips and recent saved print jobs.
- Validation: `npm run build` passed.

## 2026-04-26 - Client quick collection workflow
- Filled the next payment gap in `src/app/dashboard/biz/page.tsx` by adding a client-center quick collection panel for open receivables.
- Users can now open a client, pick any unpaid order, auto-fill half or full remaining balance, confirm collection, and immediately sync the order payment history, order status, client balance, and finance cash entry.
- Added one-click `Collect balance` actions inside linked orders so tail-payment follow-up starts from the exact order instead of re-entering everything manually.
- Validation: `npm run build` passed.

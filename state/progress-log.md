# Progress Log

## 2026-04-26
- Round: Agent status history + 24h CTX trend landed.
- Why: reference source already had context/history monitoring value, but target repo only showed latest heartbeat snapshot and could not verify trend or buildup over time.
- Code: persisted per-agent status history snapshots in Redis, extended `/api/agent-status` to return 24h history, and added a system dashboard panel with per-agent 24h CTX sparkline charts and peak/current indicators.
- Validation: `npm run build` ✅, `npm run lint` ✅ (warnings only, all pre-existing in unrelated files).

- Round: Finance audit center landed under biz finance.
- Why: the reference app already had real financial integrity tooling like balance repair and data checks, while the target site still lacked a way to scan and repair inconsistent order balances, status drift, and stale client receivable balances.
- Code: added a new finance "财务体检" tab, local audit helpers that scan order payment history vs amount paid vs balance vs status, duplicate-client phone warnings, and one-click auto-repair that recalculates order receivables and syncs client balances.
- Validation: `npm run build` ✅, `npm run lint` ✅ (warnings only, all pre-existing or unrelated).

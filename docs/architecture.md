# Structural boundaries and implementation gates

> Historical planning document. The milestone status statements below describe the initial implementation, not the current build. Read README.md, the dated validation/security reports and operator-runbook.md for current capabilities and deployment limits. The dependency and ownership boundaries remain relevant.

The initial milestone implements domain logic only. Dependency direction: orchestration/agreements/verification -> shared. Network, wallet, database and AI adapters belong outside the pure core.

## Ownership

Client approves snapshot; Master proposes; workers return versioned artifacts; verifier produces evidence-bound reports; orchestration validates transitions; contract owns custody. A model never selects an economic recipient or directly authorizes payout.

## Next implementation order

1. Validate actual worker output at runtime and bind allowed checker execution to frozen policy/constraints/source manifest.
2. Persist immutable reports and events atomically; implement job lease claims and stale completion rejection.
3. Confirm economic profile and provision Rust; implement/test real escrow in Sandbox before integration.
4. Add authenticated API, real model worker and wallet adapter; reconcile Testnet receipts.
5. Evidence bundle/replay and only then frontend polish.

## Not yet guaranteed

SQL immutability and transaction services are not implemented. Pure state helpers do not authenticate callers or prove predecessor chain acceptance. Current supplier helpers establish narrow properties and never imply semantic correctness. Funding intent is an unsigned data object, not a transaction.

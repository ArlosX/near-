# Public TDX fixtures

These are public OutLayer Testnet attestation bundles for the two historical executions validated in `docs/tee-attestation-validation-2026-11-12.md`:

- Extract: transaction `8WPtrn1MGZGjWptANVrG99GTETE1P22wSLjjT3HVmZdr`, task 62845.
- Compare: transaction `3MSG5Qaz96km4P1VbuvipHEwXp3tcFo9nRBXFBh73syj`, task 62860.

They contain public Intel collateral/quotes and synthetic procurement work. No signing keys, model credentials or payment keys. Stored verifier verdicts and `measurements_approved` are historical metadata, never on-chain proof authority. Current escrow tests must reject transplanting these old executions into a freshly prepared order.

They are not receipts of a funded TEE-mode settlement. Live fresh-order acceptance and payment are separate release gates.

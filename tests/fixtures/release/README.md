# Public new-profile release evidence

These are public Testnet execution/proof receipts over synthetic supplier data, copied from the verified second workflow. Worker artifacts were recorded Gemini outputs replayed unchanged; TEE executions, direct contract acceptances, allocation and withdrawal were fresh. No API credentials or wallet secrets are included.

The proof packets retain exact input/output Text bytes and pinned Intel collateral. Bundle verdict flags are metadata: use the contract or an independent verifier to establish authenticity. The Node transport tests check integrity/binding only. The withdrawal fixture includes the real successful private callback. Refund belongs to the separate first order that expired with incomplete work. These receipts are evidence, not instructions to resend old transactions.

The withdrawal/refund JSON fixtures omit public transaction signature fields to keep the secret-pattern scanner unambiguous. They are derived receipt fixtures, not independently authenticated raw evidence; fetch the public transaction ID from a trusted RPC when verifying provenance. TDX proof packets retain their original quote/collateral bytes.

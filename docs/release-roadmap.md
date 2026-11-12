# Release roadmap

Updated 12 November 2026. The owner requested completing these ten stages sequentially. Mark a stage complete only when its acceptance condition has been observed. Record transaction IDs and public URLs after verifying them.

| Stage | Work | State | Acceptance condition |
| --- | --- | --- | --- |
| 1 | Publish the tested Judge WASM over HTTPS | COMPLETE — published and downloaded hash verified | Download the public file and match its SHA-256 to the tested artifact |
| 2 | Execute extraction and comparison in OutLayer Testnet | COMPLETE — both public Testnet executions verified | Owner-signed requests produce actual outputs and receipts |
| 3 | Verify TEE evidence and trust path | COMPLETE — both Intel quotes, worker approvals and payload bindings passed; offline replay and eight tamper rejections passed | Worker trust and exact code/input/output bindings verified |
| 4 | Connect TEE acceptance to escrow | COMPLETE LOCALLY — direct Intel proof gate, 15 Sandbox scenarios and real-quote gas/conformance passed; not publicly deployed | Non-bypassable mode and adversarial Sandbox tests pass |
| 5 | Deploy the fresh escrow contract | COMPLETE — owner deployment, code hash, initialization, client admission and live reserve verified | Owner-signed deployment, code hash, admission and reserve verified |
| 6 | Test complete successful workflow | COMPLETE with recorded-output replay — fresh TEE proofs, allocation and actual withdrawal; not new live inference | Funded order, Gemini, TEE acceptance, allocation and actual successful withdrawal |
| 7 | Test complete failure/refund workflow | COMPLETE for incomplete-work expiry — new TEE order fully refunded; rejection-specific live path not separately claimed | Downstream work blocked and full principal refund confirmed |
| 8 | Final manual UI acceptance | PENDING | Wallet, form, four routes, responsive views and errors approved |
| 9 | Final reproduction and demo package | PENDING | Clean-copy instructions pass and 2–3 minute recording accurately represents the build |
| 10 | Submit | PENDING | Current rules checked, public links verified and owner approves final submission |

## Stage 1 checkpoint

The project directory currently belongs to a parent Desktop Git worktree. It has no dedicated repository at its own root. Publish only the prepared artifact folder, or use a dedicated project repository after reviewing its contents.

Upload bundle is `artifacts/local/tee-publish/`. Judge SHA-256 is `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051`. The bundle contains the binary, checksum and a short publication note. No environment file or private evidence is required for publishing the binary.

Published to the owner-supplied repository `https://github.com/ArlosX/near-` in commit `a25b1940d6560ac86daae4c8eceb874133ba7844`. The publication contains only the reviewed binary, SHA256SUMS.txt and README.txt. Commit author is Codex. The full application source remains local.

Immutable download URL is `https://raw.githubusercontent.com/ArlosX/near-/a25b1940d6560ac86daae4c8eceb874133ba7844/judge.wasm`. Downloaded bytes matched the expected SHA-256. Both real Gemini deliverables passed local WASI conformance again and the OutLayer request files were regenerated against this URL. Remote TEE execution remains stage 2.

## Stage 2 checkpoint

Extraction transaction `8WPtrn1MGZGjWptANVrG99GTETE1P22wSLjjT3HVmZdr` finalized successfully against `outlayer.testnet`, signed by `arlosx.testnet`. OutLayer request ID is 24826. Exact transaction arguments matched the prepared request. The returned accepted decision and every output field matched the local WASI result. Execution-completed logs reported success. Compute charged was 1362204900000000000000 yoctoNEAR and compute refund was 2637895100000000000000 yoctoNEAR, excluding transaction gas.

Comparison transaction `3MSG5Qaz96km4P1VbuvipHEwXp3tcFo9nRBXFBh73syj` finalized successfully. OutLayer request ID is 24840. Exact arguments and the full returned output matched the prepared request and local WASI result. All comparison checks passed. Compute charged was 1200506100000000000000 yoctoNEAR and compute refund was 2799593900000000000000 yoctoNEAR, excluding transaction gas. Both remote execution checks are complete. These executions replay saved work, separate from a funded TEE-enforced escrow workflow.

## Stage 3 checkpoint

The unchanged official `outlayer-verify` source at commit `90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6` verified both transactions with exit 0. Intel signatures, UpToDate TCB, approved worker measurements, execution commitments and exact on-chain input/output all passed. Collateral was read from register state at block 276791207 and matched the API copy. Both bundles passed offline replay; all eight deliberately altered input/output/code-hash/quote copies failed explicitly. See [the validation report](tee-attestation-validation-2026-11-12.md) for evidence locations and trust limits. No new transaction or financial operation was performed.

Next: stage 4, contract-enforced TEE acceptance. Passing proof verification does not itself prevent the existing designated-verifier path from bypassing TEE; the new frozen mode and adversarial tests remain required.

## Stage 4 checkpoint

Implemented the separate `outlayer-tdx-direct-v1` funding mode. Old verifier verdicts are blocked for those orders. Exact requests are committed on-chain before execution; acceptance verifies the Intel quote itself, all five pinned worker measurements and exact output/context bindings. Platform callbacks and bundle verdict booleans grant no acceptance authority. Normal expiry, full refund, allocations and withdrawals remain.

96 app tests, 12 native financial tests and all 15 Sandbox scenarios passed. The final funding guards passed a targeted repeat. Both real historical quotes passed the production proof helpers in a test-only harness (~195.14/195.39 Tgas); corrupted quotes/collateral were rejected. Final escrow Wasm SHA-256 is `695a948fdffd50eef8f17964ad0177d89d934193fd103459a866617fcdb25b63`. See [stage-4 report](tee-escrow-stage4.md) for costs, evidence, reproduction, fixed-profile limits and the distinction between conformance and a real newly funded settlement.

Next: stage 5, fresh owner-signed deployment, reserve/admission/code checks and explicit adapter mode handling. Do not reinitialize/upgrade the historical funded account or silently label legacy orders TEE-enforced.

## Stage 5 checkpoint

`agentwork-tee-arlosx.testnet` was created successfully by the owner via CLI sponsorship, transaction `7KJBJKNrpiy3yW9nM9eYGk2ufkAJd3b6dh3P2CKKz9KL`, with 10 Testnet NEAR. No code has been deployed yet. The measured-code reserve amendment reduces BASE_STORAGE to 1,376,256 bytes without changing security or financial guards. Final lean artifact is `363351675e1a6f5bd3c5809082372be901b302476357ebb8cae0b87104991caa`. Three targeted Sandbox scenarios passed, including two funded/refunded orders on a 14.25 NEAR operator budget and atomic rejection of an unfunded third slot. See [deployment checkpoint and owner runner](testnet-deployment-stage5.md). Pending: owner signs a 4.25 NEAR Testnet top-up, then the separately reviewed deployment and admission actions.

Completed: owner top-up `Ds31VtaW6WkvxuzCP8WpYZ5zYcujLYuwFm4wFAwCruw2`, deployment/initialization `6ettRgXCJDGa7MHGjNZ94BMLTdKeDVxN2WH8VxKKwnTc`, admission `Dm6c37mr5FGvZ7X6WF2HLztL8Arbbv5xtUqyRZiCyrBb`. All receipts and final views match the intended account, artifact and client. Storage and operator liquidity reserve pass; financial totals/order count are zero. The new contract is publicly deployed, but no fresh TEE-mode order has been funded and the application has not been silently switched. Next: stage 6 explicit TEE-mode wiring and the complete funded success workflow.

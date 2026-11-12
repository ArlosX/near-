# NVIDIA connection diagnosis — 11 November 2026

The configured base URL and model ID matched NVIDIA's published example. The model was also present in the live model catalog. The local v2rayN HTTP proxy is on port 10808. Explicit proxy routing reached the catalog with HTTP 200 and valid TLS. An intentionally invalid key returned 401. An unknown-model request with the configured key returned 404 in about 0.8 seconds.

A live streaming call to the configured Llama 3.2 90B model returned HTTP 200, with the first event after 32.74 seconds and content containing READY. This proves a successful inference with the current key and proxy for that request. Other attempts timed out, including a subsequent Node adapter call at 60 seconds. Service latency remains variable and the exact cause of the failed attempts is unresolved.

The old adapter capped calls at 20 seconds, below the observed successful first-token latency. NVIDIA calls now request SSE streaming and allow a maximum 60-second total deadline. Response bytes remain bounded, decoded with strict UTF-8 and duplicate-key JSON validation. Stream parsing requires a terminal stop and DONE marker and rejects tool calls and malformed sequences. Other providers retain their prior timeout cap.

The SQLite model worker renews its existing 30-second fenced lease every 10 seconds while awaiting a response. A lost lease prevents persistence. The order cutoff is still checked before output submission. New stream tests cover successful aggregation, incomplete streams, truncated finish reasons, tool calls, data after completion and duplicate fields.

The local MODEL_TIMEOUT_MS was changed to 60000 for NVIDIA. `scripts/model-vpn.ps1` starts the existing isolated model command with process-local proxy variables. Its default check action makes no inference request. Run action invokes live model work and consumes provider quota. Existing persisted NVIDIA request hashes differ because the stream flag changed, so use a fresh model order.

Full two-task inference and deterministic acceptance remain pending. Successful diagnostic text is insufficient to establish workflow quality or settlement readiness.

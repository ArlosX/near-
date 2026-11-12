# NEAR AI Cloud model connection

Status: implemented adapter and local asynchronous runner. Validated using scripted provider responses plus an actual local HTTP provider double. No request was sent to NEAR AI Cloud, and no paid inference was performed. Synthetic procurement documents remain the demo input. No new runtime dependency was introduced.

## Configure locally
From the project root, copy .env.example to .env.local. Fill MODEL_NAME with an available NEAR AI Cloud model identifier and MODEL_API_KEY with your key. MODEL_PROVIDER must be near-ai. Keep secrets local; .env.local is ignored. No model is silently selected or substituted.

- npm run model:check: validate configuration, print safe limits, perform zero network calls. This does not validate key authenticity, credits, model availability or response quality.
- npm run model:run: create a fresh model order and execute it; this command can incur provider charges.
- npm run model:run -- --resume ORDER_ID: resume that existing order only, under persisted attempt limits and its original cutoff.

The CLI prints the order ID and database path before inference. Default database: artifacts/local/model.sqlite, deliberately separate from artifacts/local/console.sqlite. MODEL_DB_PATH may override it. The console remains a synthetic fixture UI; this milestone does not add a model-run interface.

## Data path
Service-owned immutable agreement, sources, policy and accepted local dependencies build the request. Fixture supplier answers are excluded from extraction input. Comparison receives exact accepted extraction bytes and hashes. Prior verification feedback is included on revision.

A fenced database transaction reserves an attempt BEFORE network I/O. Request body, endpoint and request hash are persisted without authorization headers or API keys. Successful calls persist the original assistant content, usage and gateway request ID; provider error bodies and reasoning traces are not stored. Completed records are protected by immutability triggers.

JSON presentation is normalized to project canonical JSON v1 before submission; the original content remains in the model call record. Invalid JSON is passed unchanged to the existing verifier for schema feedback. This normalization does not claim to preserve duplicate-key ambiguity: the normalized artifact is the verified byte representation, and raw content remains auditable.

The model never sets service-owned revision count, cutoff, dependency acceptance, report decision or payment state. Reports continue to declare deterministic_only and dependency acceptance is local-only.

## Limits and recovery
Defaults: timeout 15 seconds, maximum output 2048 tokens, maximum input request 64KB, maximum HTTP response 256KB, at most two transport attempts per task artifact version. Configured timeout cannot exceed 20 seconds, output cap 4096 tokens, attempt cap two. A 30-second lease is renewed before each outbound request; the returned response must still pass fencing before it can be stored or submitted. Cutoff reached during inference produces an expired order and no accepted late artifact.

Attempt counts survive restart and explicit requeue. Pending attempts count toward the cap. A persisted successful response is reused if a process dies before artifact submission; changing its model/prompt is rejected. An ambiguous timeout or process death after the provider handled a request but before local persistence may still produce a second billable request within the cap. Exactly-once billing is NOT guaranteed. Input byte/output token/request-count bounds are not an exact dollar spending cap; check provider pricing and account credits before running.

For the current two-task, one-revision demo, the configured maximum is eight reserved calls per order (2 tasks × 2 artifact versions × 2 attempts). The CLI targets only its explicitly requested order and does not drain unrelated jobs. Repeatedly creating new orders establishes a new budget each time.

## Verification limits and next gate
Quotation presence, arithmetic, eligibility, schema and dependency binding are deterministic checks. They do NOT establish that every extracted price/delivery fact is true or fully supported by the text. Prompt instructions are also not an enforceable security boundary. Before settlement based on arbitrary supplier documents, strengthen field-level evidence binding or add an explicit independent/human acceptance gate. No claim of injection-proof semantic extraction is made.

No attestation/response signature verification is implemented. A successful NEAR AI API response is not a local proof of TEE execution. No chain acceptance, wallet or payment was added. PostgreSQL and Rust escrow work remain separate gates, and economic choices remain unapproved.

Official protocol reference: https://docs.near.ai/cloud/quickstart (endpoint, bearer authentication, message/response format, request ID). Model selection and live provider compatibility still require an actual configured smoke run.

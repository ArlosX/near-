# Agent security probes — 11 November 2026

## Sources reviewed

- OWASP GenAI LLM Top 10 provides the risk categories used here, including prompt injection, sensitive information disclosure, excessive agency, unbounded consumption and improper output handling. https://github.com/GenAI-Security-Project/GenAI-LLM-Top10
- NVIDIA garak's PromptInject module describes adversarial instruction overrides and malicious commands embedded in otherwise benign tasks. https://github.com/NVIDIA/garak/blob/main/garak/probes/promptinject.py
- Microsoft PyRIT describes targets, adversarial prompts and cross-domain injection where an attacker-controlled resource is later consumed by another target. https://github.com/microsoft/PyRIT/blob/main/doc/code/framework.md

## Method and scope

Adapted relevant threat patterns into four application regression tests in `tests/agent-adversarial.test.mjs`. Provider responses are local test doubles. Source payloads are synthetic. The target is our model-response parser and deterministic acceptance boundary. The garak and PyRIT toolkits themselves were not executed. Live model susceptibility needs configured inference credentials and a separate bounded run.

| Test | Observed before correction | Current control |
| --- | --- | --- |
| Duplicate provider-envelope keys | A response containing two choices fields silently used the last value | Shared strict JSON parser rejects ambiguous keys |
| Malformed UTF-8 inside provider content | Invalid bytes became replacement characters and the envelope was accepted | Fatal UTF-8 decoding rejects malformed response bytes |
| Override/payment/exfiltration instructions appended to an approved source | Existing v2 verification rejected unsupported source grammar | Frozen source facts fail even when the test recomputes the source and agreement hashes |
| Extra verdict, recipient, tool-call or HTML fields in generated artifacts | Existing artifact schema rejected the additional fields | Model output cannot extend the accepted schema or add payment authority |

The final test also checks that source instructions cannot select a different request endpoint and that the API-key canary is absent from the request object that can be persisted. It does not evaluate whether a model would repeat sensitive input text.

## Fix

`packages/model/src/near-ai.ts` now uses fatal UTF-8 decoding and the existing `parseJsonStrict` implementation for provider envelopes. This also applies the shared parser's nesting bound. Existing response-size, endpoint, redirect, choice-count and finish-reason checks remain part of the adapter.

The duplicate-key and invalid-UTF-8 regression tests failed before this change with “Missing expected rejection.” The two acceptance-boundary tests already passed. These are parser-hardening findings. They do not demonstrate that an attacker could transfer money or forge a verifier signature.

## Reproduce

```powershell
node --test --test-isolation=none tests/agent-adversarial.test.mjs
npm run security:check
```

Existing model-worker regressions additionally cover persisted transport-attempt limits, restart behavior, provider-error secrecy, invalid-output revision exhaustion and dependent execution. The trusted verifier and authenticated orchestration remain security assumptions. This test does not establish model-level injection immunity, full exfiltration prevention or TEE execution.

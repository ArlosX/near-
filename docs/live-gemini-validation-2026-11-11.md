# Live Gemini workflow validation — 11 November 2026

## Successful run

Provider was Gemini with model `gemini-3.5-flash-lite`. Credentials were read from the separate local `GEMINI_API_KEY` field and passed to the existing runner only for that child process. NVIDIA settings were retained. Requests used the existing v2 synthetic supplier documents and deterministic policies.

Order `demo-3610a04d-cc17-47ef-ba4c-a5e72dd5b168` reached `CHECKS_PASSED_LOCAL` with two live provider calls and two accepted reports. The comparison consumed the accepted extraction through the existing dependency mechanism. Persistence is in the isolated local model SQLite database, separate from the fixture console.

| Task | Decision | Report hash |
| --- | --- | --- |
| extract v1 | accepted | sha256:adb284b2ba4bde64790f1aa8b4fc7963e6f4be33e9803fdae881c3ebf185fdf9 |
| compare v1 | accepted | sha256:e3d4fb7cf2b31d1a03e2d5c276e0888a13e41d426e11f10a93a441a27c62e0f2 |

Each artifact version allowed one transport attempt during this validation. Outputs, provider metadata and reports were persisted by the existing model worker. API keys were excluded from request records and output logs.

## Compatibility issue found and corrected

An initial order returned Markdown-fenced JSON on both extraction versions, exhausted its revision allowance and correctly failed. Its ID is `demo-2359b7a8-b5f9-4f09-94ef-f862fcd277f6`. These records were preserved.

The adapter now sets `response_format` to `json_object` for Gemini and explicitly instructs the model to omit Markdown fences. The successful run used a fresh agreement and order after this request change. Schema, source-fact and dependency validation still decide whether generated JSON is accepted.

The older configured `gemini-2.5-flash-lite` model returned an explicit 404 stating it is unavailable to new users and recommending `gemini-3.5-flash-lite`. The separate local `GEMINI_MODEL` value was updated after the replacement model returned a successful diagnostic response.

## Validation boundary

This establishes one complete live local model workflow on structured synthetic documents. Public Testnet financial execution, PostgreSQL model execution and remote OutLayer execution retain their separate gates. The existing fixture dashboard continues to show its own database. This result does not imply that connecting a wallet starts live model work or that local acceptance transfers funds.

Official compatibility reference reviewed for structured output support is https://ai.google.dev/gemini-api/docs/openai.

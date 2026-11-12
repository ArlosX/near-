# Local security spot check — 11 November 2026

## Scope and tools

Executed ProjectDiscovery Nuclei v3.11.1 from its official GitHub release. The downloaded ZIP was checked against the SHA-256 digest supplied by the GitHub release API. Two official signed templates were inspected and executed, `git-config` and `http-missing-security-headers`. Rate was limited to three requests per second with one concurrent template, four-second request timeout and zero retries. OAST and redirects were disabled. Results were stored locally.

Targets were the loopback fixture console on port 4317 and the authenticated console on port 4318. Port 4318 refused connections, so this scan establishes no authenticated-console result.

## Results and changes

Nuclei found no Git-configuration exposure on port 4317. Its security-header template produced five informational matches for absent HSTS, X-Permitted-Cross-Domain-Policies, COEP, COOP and CORP.

Added `Cross-Origin-Resource-Policy: same-origin` and `X-Permitted-Cross-Domain-Policies: none` to the shared console server. The first controls cross-origin resource embedding. The second denies legacy cross-domain policy access. The updated headers were verified against a newly started isolated server instance.

HSTS belongs to the HTTPS hosting configuration. The current console uses loopback HTTP. COOP and COEP require separate compatibility review, particularly for the wallet popup and postMessage flow. Their absence alone was not treated as a proven exploit.

Twelve additional bounded checks passed against an isolated in-memory fixture server. They covered both added headers, five file/path/evidence probes, forged Host, cross-origin requests, same-site API requests, missing mutation guard, duplicate JSON keys and invalid UTF-8. Rejected requests returned 400 and no successful file response. Source and raw local scanner results are under `artifacts/local/nuclei/` and excluded from the source bundle.

## Limits

This is a short unauthenticated HTTP spot check with two scanner templates and focused adversarial probes. It does not establish comprehensive penetration-test coverage, authenticated authorization coverage, model prompt-injection resistance, financial-contract security or public-hosting readiness. Earlier application/PostgreSQL/contract security tests have their own separate scope.

The running user server requires a restart to pick up the new response headers.

## Sources

- https://github.com/projectdiscovery/nuclei
- https://github.com/projectdiscovery/nuclei-templates
- https://github.com/zaproxy/zaproxy-website/blob/main/site/content/docs/docker/baseline-scan.md

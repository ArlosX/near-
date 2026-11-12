# Ice Blue × Graphite

Visual-only update to the existing plain HTML/CSS dashboard. Shared tokens live in `apps/test-console/public/style.css`; the hero SVG references those tokens. Existing Space Grotesk typography, spacing, component geometry, routing and breakpoints are retained.

## Palette and treatment

- Background layers: #090D11, #0D1319, #111A22, #17232D.
- Accent hierarchy: #8BD8F8 primary, #B9EDFF hover, #D1F4FF pressed/emphasis, #347FA5 decorative connectors.
- Text: #F4F8FA primary, #A5B4BE secondary; #71818C reserved for decorative captions.
- Supplied glass/subtle border and glass background values are centralized. Controls retain a stronger graphite border for discoverability.
- Calm static ambient gradients, low-opacity wave and cube lighting, 8px panel blur and 12px sidebar blur. No added animation or external dependencies.
- Failures retain their existing rose semantic color and explicit labels. Accepted verification uses ice blue.

## Validation

- Application JavaScript is byte-identical to the pre-theme backup. HTML differs only in colors and decorative SVG opacity.
- `npm run security:check`: 80 tests passed, TypeScript and syntax checks passed. No separate build/lint script exists for this static UI.
- Browser inspection: overview, existing order list, workflow, evidence, create dialog, demo page; existing local data was used without adding or replacing orders.
- Desktop and 390px phone views inspected; phone and 768px tablet width checks show no document overflow. Responsive rules were not changed.
- Focus and disabled states inspected; hover/pressed/loading declarations reviewed. Error/success distinctions retained.
- Token contrast: primary text/card 16.45:1; secondary text/elevated surface 7.51:1; primary button text/background 12.32:1. This is a token-level check, not a full accessibility certification.

No wallet signing, API integration change, smart-contract action, business-logic edit or model invocation was performed.

$ErrorActionPreference = 'Stop'
# Kept as an explicit safety gate for older instructions/bookmarks.
throw 'Historical deployment script disabled: it targets an initialized escrow and an obsolete artifact. Run node scripts/prepare-deployment.mjs for an offline review bundle and follow OWNER-STEPS.md. Do not reinitialize the historical account.'

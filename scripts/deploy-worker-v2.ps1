$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $projectRoot
try {
 & node --env-file=.env.local scripts/review-worker-v2.mjs
 if($LASTEXITCODE -ne 0){throw 'V2 deployment review failed; do not sign'}
 $cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
 $wasm=Join-Path $projectRoot 'artifacts/local/worker-profile-v2/work_escrow_v2.wasm'
 Write-Output 'NEW TESTNET ACCOUNT ONLY: deploy separately reviewed worker-v2 artifact and initialize once. Zero attached deposit. Choose send yourself.'
 & $cli contract deploy agentwork-tee-v2-arlosxq.testnet use-file $wasm with-init-call new json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain
 if($LASTEXITCODE -ne 0){throw 'V2 deployment CLI failed; verify receipt before retrying'}
} finally {Pop-Location}

$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $projectRoot
try {
 & node --env-file=.env.local scripts/review-worker-v3-upgrade.mjs
 if($LASTEXITCODE -ne 0){throw 'V3 upgrade review failed; do not sign'}
 $cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
 $wasm=Join-Path $projectRoot 'artifacts/local/worker-profile-v3/work_escrow_v3.wasm'
 Write-Output 'TESTNET CODE-ONLY UPGRADE: same v2 account, NO initializer. Existing funded orders retain their frozen v2 profile; ONLY NEW orders use the reviewed two-worker v3 allowlist. Choose send yourself.'
 & $cli contract deploy agentwork-tee-v2-arlosxq.testnet use-file $wasm without-init-call network-config testnet sign-with-keychain
 if($LASTEXITCODE -ne 0){throw 'Upgrade CLI failed; inspect the receipt before retrying'}
} finally {Pop-Location}

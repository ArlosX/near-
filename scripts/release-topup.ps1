$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $projectRoot
try{
 & node scripts/release-preflight.ts --prepare-topup
 if($LASTEXITCODE -ne 0){throw 'Top-up preflight failed; no transfer prepared'}
 Write-Output 'TESTNET: transfer 0.1 NEAR from your contract operator account to arlosx.testnet for gas. No escrow liabilities exist; the next order storage reserve and fee headroom are preserved. Review before send.'
 $cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
 & $cli tokens agentwork-tee-arlosx.testnet send-near arlosx.testnet '0.1 NEAR' network-config testnet sign-with-keychain
 if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE"}
}finally{Pop-Location}

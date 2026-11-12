$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $projectRoot
try {
 & node scripts/prepare-expired-refund.ts
 if($LASTEXITCODE -ne 0){throw 'Refund preparation failed; no transaction will be signed'}
 if(!(Test-Path -LiteralPath 'artifacts/local/release-refund/intent.json')){Write-Output 'No signature needed. Read the printed state.';return}
 $intent=Get-Content -Raw -LiteralPath 'artifacts/local/release-refund/intent.json'|ConvertFrom-Json
 if($intent.receiverId -ne 'agentwork-tee-arlosx.testnet' -or $intent.signerId -ne 'arlosx.testnet' -or $intent.methodName -notin @('mark_expired','claim_refund') -or $intent.depositAtomic -ne '0'){throw 'Refund intent outside the reviewed scope'}
 $cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
 $argsFile=Join-Path $projectRoot 'artifacts/local/release-refund/args.json'
 Write-Output 'TESTNET: review the zero-deposit expiry/refund call. Choose send yourself.'
 & $cli contract call-function as-transaction $intent.receiverId $intent.methodName file-args $argsFile prepaid-gas '80 Tgas' attached-deposit '0 yoctoNEAR' sign-as $intent.signerId network-config testnet sign-with-keychain
 if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE"}
} finally {Pop-Location}

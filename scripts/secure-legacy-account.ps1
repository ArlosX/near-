param([ValidateSet('Import','Revoke')][string]$Action='Import')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
$folder=Join-Path $projectRoot 'artifacts/local/legacy-key-rotation'
$compromised='ed25519:2qpgEmQAbhDBHeDvks2hU5dpxQbA6wQPHko9VpT6ooZE'
function Keys {
 $json=& node (Join-Path $PSScriptRoot 'read-legacy-keys.mjs')
 if($LASTEXITCODE -ne 0){throw 'Cannot verify finalized legacy access keys'}
 return @($json|ConvertFrom-Json)
}
New-Item -ItemType Directory -Path $folder -Force|Out-Null
$keys=Keys
if(!($keys|Where-Object {$_.public_key -eq $compromised})){Write-Output 'Known exposed key is already absent. No action prepared.';return}
if($Action -eq 'Import'){
 $baseline=Join-Path $folder 'before-import.json'
 if(Test-Path -LiteralPath $baseline){
  $original=@(Get-Content -Raw -LiteralPath $baseline|ConvertFrom-Json)
  $originalPublic=@($original|ForEach-Object {$_.public_key})
  $approved=@($keys|Where-Object {$_.public_key -notin $originalPublic -and $_.access_key.permission -eq 'FullAccess'})
  if($approved.Count -eq 1){Write-Output 'A new Full Access key is already approved. Ask to verify it before revocation; no further import started.';return}
  if($approved.Count -gt 1){throw 'Multiple new keys detected; review before continuing'}
  Write-Output 'No new key was approved. Reusing the original baseline and opening Intear Testnet for arlos.testnet.'
 }else{$keys|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $baseline -Encoding UTF8}
 Write-Output 'Security rotation: authorize only arlos.testnet in the Testnet wallet. The CLI generates a new key and stores it in your system keychain. Do not export or paste any private key. No old key is deleted in this step.'
 & $cli account import-account using-web-wallet arlos.testnet network-config testnet --wallet-url 'https://wallet.intear.tech/' save-to-keychain
 if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE. Keep the baseline and inspect before retrying."}
 Write-Output 'Approve the new access key in the wallet, then tell the assistant. Revocation has NOT been sent.'
 return
}
$baseline=Join-Path $folder 'before-import.json'
if(!(Test-Path -LiteralPath $baseline)){throw 'First establish a fresh owner-controlled key with Action Import'}
$before=@(Get-Content -Raw -LiteralPath $baseline|ConvertFrom-Json)
$beforePublic=@($before|ForEach-Object {$_.public_key})
$fresh=@($keys|Where-Object {$_.public_key -notin $beforePublic -and $_.public_key -ne $compromised -and $_.access_key.permission -eq 'FullAccess'})
if($fresh.Count -ne 1){throw 'Expected exactly one newly approved Full Access key. No key deletion prepared.'}
if(@($keys|Where-Object {$_.access_key.permission -eq 'FullAccess'}).Count -lt 2){throw 'Refusing to delete the only Full Access key'}
Write-Output 'Review: delete only the known exposed public key on arlos.testnet, signed with the newly retained key. Other keys and the new TEE contract are unchanged. Choose send yourself.'
& $cli account delete-keys arlos.testnet public-keys $compromised network-config testnet sign-with-keychain --signer-public-key $fresh[0].public_key
if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE"}

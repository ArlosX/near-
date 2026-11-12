param([Parameter(Mandatory=$true)][ValidateSet('Fund','Deploy','Admit','Check')][string]$Action)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
$manifestFile=Join-Path $projectRoot 'artifacts/local/deployment-review/manifest.json'
$contract='agentwork-tee-arlosx.testnet'
$client='arlosx.testnet'
$expectedKey='ed25519:8maZW6ssvFe5daifFW5U8XErRq4sM1WNW8ynHJSrKjjT'
$rpc='https://rpc.testnet.fastnear.com'
function Rpc($method,$params) {
 $body=@{jsonrpc='2.0';id='stage5-owner-review';method=$method;params=$params}|ConvertTo-Json -Depth 20 -Compress
 $r=Invoke-RestMethod -Uri $rpc -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30
 if($r.error){throw ($r.error|ConvertTo-Json -Depth 6 -Compress)}
 return $r.result
}
function Account($id){Rpc 'query' @{request_type='view_account';finality='final';account_id=$id}}
function View($method,$viewArgs) {
 $bytes=[Text.Encoding]::UTF8.GetBytes(($viewArgs|ConvertTo-Json -Compress))
 $r=Rpc 'query' @{request_type='call_function';finality='final';account_id=$contract;method_name=$method;args_base64=[Convert]::ToBase64String($bytes)}
 if($r.error){throw $r.error}
 return ([Text.Encoding]::UTF8.GetString([byte[]]$r.result)|ConvertFrom-Json)
}
function Invoke-Near([string[]]$NearArgs){
 # No final 'send' argument: the owner reviews the unsigned transaction and
 # chooses send in the official CLI. No key is read/exported by this script.
 & $cli @NearArgs
 if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE"}
}
if(!(Test-Path -LiteralPath $cli)){throw 'Official NEAR CLI not found'}
$keys=Rpc 'query' @{request_type='view_access_key_list';finality='final';account_id=$contract}
$full=@($keys.keys|Where-Object {$_.access_key.permission -eq 'FullAccess'})
if($full.Count -ne 1 -or $full[0].public_key -ne $expectedKey){throw 'Fresh contract account FullAccess key differs from the verified creation receipt'}
$account=Account $contract
if($Action -eq 'Fund'){
 if($account.code_hash -ne ('1'*32)){throw 'Account already has code; review deployment before funding'}
 if([bigint]$account.amount -ge [bigint]'14250000000000000000000000'){Write-Output 'Funding already sufficient; no transfer prepared';exit 0}
 if([bigint]$account.amount -ne [bigint]'10000000000000000000000000'){throw 'Unexpected starting balance; recalculate the top-up instead of sending a fixed amount'}
 $payer=Account $client
 if([bigint]$payer.amount -lt [bigint]'4300000000000000000000000'){throw 'Client needs 4.25 NEAR top-up plus fee headroom'}
 Write-Output 'TESTNET ONLY: transfer 4.25 NEAR from arlosx.testnet to agentwork-tee-arlosx.testnet. Review before selecting send.'
 Invoke-Near -NearArgs @('tokens',$client,'send-near',$contract,'4.25 NEAR','network-config','testnet','sign-with-keychain')
 $after=Account $contract
 if([bigint]$after.amount -lt [bigint]'14250000000000000000000000'){throw 'Top-up is not confirmed; do not deploy yet'}
 Write-Output 'Top-up confirmed. Deployment has NOT been sent.'
 exit 0
}
if(!(Test-Path -LiteralPath $manifestFile)){throw 'Prepare the deployment review manifest first'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if($manifest.account -ne $contract -or $manifest.network -ne 'testnet'){throw 'Wrong review manifest account or network'}
$wasm=Join-Path $projectRoot 'contracts/work-escrow/target/wasm32-unknown-unknown/release/work_escrow.wasm'
if((Get-FileHash -LiteralPath $wasm -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256){throw 'Reviewed Wasm checksum differs'}
foreach($source in $manifest.sources.PSObject.Properties){
 if((Get-FileHash -LiteralPath (Join-Path $projectRoot $source.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $source.Value){throw "Reviewed source changed: $($source.Name)"}
}
$expectedCode=& node (Join-Path $PSScriptRoot 'deployment-code-hash.mjs') $wasm
if($LASTEXITCODE -ne 0){throw 'Could not derive expected code hash'}
if($Action -eq 'Deploy'){
 if($account.code_hash -eq $expectedCode){Write-Output 'Reviewed code is already deployed. No reinitialization prepared.';exit 0}
 if($account.code_hash -ne ('1'*32)){throw 'Different code exists; automatic upgrade is forbidden'}
 if([bigint]$account.amount -lt [bigint]'14250000000000000000000000'){throw 'Confirm the 14.25 NEAR operator budget first'}
 Write-Output "TESTNET ONLY: deploy reviewed Wasm $($manifest.sha256) and initialize the fresh contract."
 Invoke-Near -NearArgs @('contract','deploy',$contract,'use-file',$wasm,'with-init-call','new','json-args','{}','prepaid-gas','100 Tgas','attached-deposit','0 NEAR','network-config','testnet','sign-with-keychain')
 if((Account $contract).code_hash -ne $expectedCode){throw 'Deployed code hash is not confirmed'}
 $null=View 'get_accounting' @{}
 Write-Output 'Code hash and initialization confirmed. Client admission is a separate step.'
 exit 0
}
if($account.code_hash -ne $expectedCode){throw 'Reviewed code is not deployed'}
if($Action -eq 'Admit'){
 if((View 'is_client_admitted' @{client=$client}) -eq $true){Write-Output 'Client already admitted; no transaction prepared';exit 0}
 $argsFile=Join-Path (Split-Path $manifestFile -Parent) 'client-admission.json'
 [IO.File]::WriteAllText($argsFile,(@{client=$client;allowed=$true}|ConvertTo-Json -Compress))
 Invoke-Near -NearArgs @('contract','call-function','as-transaction',$contract,'set_client_admission','file-args',$argsFile,'prepaid-gas','50 Tgas','attached-deposit','0 NEAR','sign-as',$contract,'network-config','testnet','sign-with-keychain')
 if((View 'is_client_admitted' @{client=$client}) -ne $true){throw 'Admission is not confirmed'}
 Write-Output 'Client admission confirmed. The application environment has NOT been changed.'
 exit 0
}
$accounting=View 'get_accounting' @{}
$admitted=View 'is_client_admitted' @{client=$client}
[pscustomobject]@{network='testnet';contract=$contract;code_hash_confirmed=$true;client=$client;client_admitted=$admitted;accounting=$accounting}|ConvertTo-Json -Depth 8



param([ValidateSet('Funding','Plan','Execute','Proof','Withdraw')][string]$Action='Funding')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$cli=Join-Path $projectRoot 'artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe'
Push-Location -LiteralPath $projectRoot
try {
 $runName=& node --env-file=.env.local --input-type=module -e "import {operatorRun} from './packages/shared/src/operator-run.ts';process.stdout.write(operatorRun().name)"
 if($LASTEXITCODE -ne 0 -or $runName -notmatch '^stage6-success(?:-[a-z0-9-]{1,30})?$'){throw 'Invalid run directory'}
 $actor=& node --env-file=.env.local --input-type=module -e "import {operatorRun} from './packages/shared/src/operator-run.ts';process.stdout.write(operatorRun().actor)"
 if($LASTEXITCODE -ne 0 -or $actor -notin @('arlosx.testnet','arlosxq.testnet')){throw 'Invalid reviewed operator account'}
 $contract=& node --env-file=.env.local --input-type=module -e "import {operatorRun} from './packages/shared/src/operator-run.ts';process.stdout.write(operatorRun().contract)"
 if($LASTEXITCODE -ne 0 -or $contract -notin @('agentwork-tee-arlosx.testnet','agentwork-tee-v2-arlosxq.testnet')){throw 'Invalid reviewed escrow'}
 $runFolder=Join-Path 'artifacts/local' $runName
 $nodeAction=switch($Action){'Funding'{'--funding'} 'Execute'{'--execute'} default{'--plan'}}
 if($Action -eq 'Proof'){& node --env-file=.env.local scripts/stage6-proof.mjs}
 elseif($Action -eq 'Withdraw'){& node --env-file=.env.local scripts/prepare-withdrawal.ts}
 else {& node --env-file=.env.local scripts/stage6-success.ts $nodeAction}
 if($LASTEXITCODE -ne 0){throw 'Fresh stage-6 intent preparation failed; no transaction will be signed'}
 if(!(Test-Path -LiteralPath (Join-Path $runFolder 'next-intent.json'))){throw 'This step requires no signature. Read the printed next action.'}
 $intent=Get-Content -Raw -LiteralPath (Join-Path $runFolder 'next-intent.json')|ConvertFrom-Json
 $allowed=switch($Action){'Funding'{@('create_tee_work_order')} 'Execute'{@('request_execution')} 'Proof'{@('submit_tee_result')} 'Withdraw'{@('withdraw_claimable')} default{@('prepare_tee_request','finalize_success')}}
 if($allowed -notcontains $intent.methodName){throw 'No signable action for this step'}
 $receiver=if($Action -eq 'Execute'){'outlayer.testnet'}else{$contract}
 if($intent.receiverId -ne $receiver -or $intent.signerId -ne $actor){throw 'Unexpected stage-6 signer or receiver'}
 if($Action -eq 'Funding' -and $intent.depositAtomic -ne '1000000000000000000000'){throw 'Stage-6 principal must be exactly 0.001 Testnet NEAR'}
 if($Action -eq 'Plan' -and $intent.depositAtomic -ne '0'){throw 'No deposit is permitted for preparation or allocation'}
 if($Action -eq 'Proof' -and $intent.depositAtomic -ne '0'){throw 'Proof submission must have zero deposit'}
 if($Action -eq 'Withdraw' -and $intent.depositAtomic -ne '0'){throw 'Withdrawal must have zero attached deposit'}
 if($Action -eq 'Execute' -and ([bigint]$intent.depositAtomic -le 0 -or [bigint]$intent.depositAtomic -gt [bigint]'10000000000000000000000')){throw 'OutLayer deposit exceeds reviewed budget'}
 $gas=if($intent.gasTgas){[int]$intent.gasTgas}else{80}
 $expectedGas=switch($Action){'Execute'{100} 'Proof'{250} default{80}}
 if($gas -ne $expectedGas){throw 'Unexpected gas budget'}
 $argsFile=Join-Path $projectRoot (Join-Path $runFolder 'next-args.json')
 Write-Output 'TESTNET ONLY. Review the unsigned transaction. Select send yourself; this script does not automatically send.'
 & $cli contract call-function as-transaction $intent.receiverId $intent.methodName file-args $argsFile prepaid-gas "$gas Tgas" attached-deposit "$($intent.depositAtomic) yoctoNEAR" sign-as $intent.signerId network-config testnet sign-with-keychain
 if($LASTEXITCODE -ne 0){throw "NEAR CLI exited with code $LASTEXITCODE"}
} finally {Pop-Location}

param([ValidateSet('check','run')][string]$Action='check')
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $env:HTTPS_PROXY='http://127.0.0.1:10808'
    $env:HTTP_PROXY='http://127.0.0.1:10808'
    $env:NODE_USE_ENV_PROXY='1'
    $env:NO_PROXY='localhost,127.0.0.1,::1'
    & node --env-file=.env.local scripts/model-run.ts ('--'+$Action)
    if ($LASTEXITCODE -ne 0) { throw 'Model command failed. Review the sanitized output.' }
} finally { Pop-Location }

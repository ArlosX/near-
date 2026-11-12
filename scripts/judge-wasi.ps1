param([ValidateSet('build','test')][string]$Action='test', [string]$WasmtimePath='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $localCargo=Join-Path $projectRoot 'artifacts/local/toolchain/cargo'
    if (Test-Path (Join-Path $localCargo 'bin/cargo.exe')) {
        $env:CARGO_HOME=$localCargo
        $env:RUSTUP_HOME=Join-Path $projectRoot 'artifacts/local/toolchain/rustup'
        $env:PATH=(Join-Path $localCargo 'bin')+';'+$env:PATH
    }
    $env:RUSTFLAGS=''
    & cargo +stable-x86_64-pc-windows-gnu test --locked --manifest-path packages/judge-wasi/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Judge native tests failed.' }
    & cargo +stable-x86_64-pc-windows-gnu build --locked --release --target wasm32-wasip2 --manifest-path packages/judge-wasi/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Judge WASI build failed.' }
    if ($Action -eq 'test') {
        if ($WasmtimePath) { & node scripts/test-wasi-judge.mjs $WasmtimePath }
        else { & node scripts/test-wasi-judge.mjs }
        if ($LASTEXITCODE -ne 0) { throw 'Judge WASI conformance failed.' }
    }
} finally { Pop-Location }

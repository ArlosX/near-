param([ValidateSet('test','build','fmt')][string]$Action='test')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$localCargo=Join-Path $projectRoot 'artifacts/local/toolchain/cargo'
$localRustup=Join-Path $projectRoot 'artifacts/local/toolchain/rustup'
$toolchainArgs=@()
if (Test-Path (Join-Path $localCargo 'bin/cargo.exe')) {
 $env:CARGO_HOME=$localCargo
 $env:RUSTUP_HOME=$localRustup
 $env:PATH=(Join-Path $localCargo 'bin')+';'+$env:PATH
 $toolchainArgs=@('+stable-x86_64-pc-windows-gnu')
}
$manifest=Join-Path $projectRoot 'contracts/work-escrow/Cargo.toml'
$env:CARGO_TARGET_DIR=Join-Path $projectRoot 'contracts/work-escrow/target'
if ($Action -eq 'build') { $env:RUSTFLAGS='--cfg near -C target-cpu=mvp'; & cargo @toolchainArgs build --locked --manifest-path $manifest --target wasm32-unknown-unknown --release
 if ($LASTEXITCODE -ne 0) { throw 'Escrow Wasm build failed' }
 & cargo @toolchainArgs build --locked --manifest-path (Join-Path $projectRoot 'contracts/test-actor/Cargo.toml') --target wasm32-unknown-unknown --release
 if ($LASTEXITCODE -ne 0) { throw 'Test actor build failed' }
 & cargo @toolchainArgs build --locked --manifest-path (Join-Path $projectRoot 'contracts/tee-proof-bench/Cargo.toml') --target wasm32-unknown-unknown --release }
elseif ($Action -eq 'fmt') { & cargo @toolchainArgs fmt --manifest-path $manifest -- --check }
else { & cargo @toolchainArgs test --locked --manifest-path $manifest }
if ($LASTEXITCODE -ne 0) { throw "Contract $Action failed" }

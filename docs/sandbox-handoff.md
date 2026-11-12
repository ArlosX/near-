# Resume after Windows restart

Current milestone: Rust financial contract written and release Wasm compiled; 12 native Rust core tests and 50 application tests pass. No Sandbox transaction has been executed. Seven real Sandbox scenarios are prepared. Do not claim the financial acceptance gate complete.

## Action needed from owner
Save open work and restart Windows once. Do not run shutdown/reboot automatically. After restart, return to this chat and say you are back; the agent can continue the setup and testing.

Administrative WSL/Ubuntu installation was explicitly authorized. The installer returned zero, but before restart wsl --list --verbose reports WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED, and Component Based Servicing/RebootPending is true. Ubuntu installation/registration remains unconfirmed. A restart may be sufficient to activate the features; verify rather than assume.

## Agent continuation
1. Inspect wsl --status and wsl --list --verbose. If no Ubuntu distro exists after components activate, finish the already authorized Ubuntu installation. Do not unregister or replace any existing distro or automatically reboot. Ask only if an actual interactive Windows/Linux credential is required.
2. Start Ubuntu and verify a Linux x86_64 shell. Use the installed distro name, not an assumed name. Install missing curl/tar/xz prerequisites if necessary.
3. From this project, run bash scripts/sandbox-linux.sh inside Linux. The script installs checksum-verified Linux Node 24.16.0 under artifacts/local/linux-tools, then npm ci and npm test in tests/sandbox. Do not reuse the application's Windows pnpm dependencies in Linux.
4. Compiled files: contracts/work-escrow/target/wasm32-unknown-unknown/release/work_escrow.wasm and escrow_test_actor.wasm. Rebuild with npm run contract:build on Windows if code changes. Rust and Cargo homes are artifacts/local/toolchain/rustup and artifacts/local/toolchain/cargo. Public deployment is not authorized by a local test.
5. Fix actual runtime/API/gas/storage or promise-order failures, keeping the approved financial profile. Test actor account deletion is disclosed failure injection; validate receipt ordering rather than weakening assertions or marking tests skipped.
6. Complete remaining runtime bounds/solvency tests before declaring the financial gate passed. Then continue PostgreSQL/storage and authenticated application integration in stable-build-path.md. Model credentials, real documents and Testnet accounts are still later resources; do not request or print secret keys here.

## Prepared Sandbox scenarios
Unauthorized verifier/callback, wrong and duplicate funding, early dependent result, duplicate initialization; success credit and real withdrawal; final rejection and real refund; expiry versus late finalization; credits arriving before withdrawal callback; failed withdrawal restoration/retry; failed refund restoration/retry. Their code and Linux setup syntax have been checked, but none of these scenarios has executed yet.

## References
WSL installation: https://learn.microsoft.com/en-us/windows/wsl/install
NEAR Sandbox supported host platforms: https://github.com/near/near-sandbox-rs
NEAR Workspaces API: https://github.com/near/workspaces-js

Post-restart update: WSL 2 is active, Ubuntu download completed but VM registration failed with HCS_E_HYPERV_NOT_INSTALLED. Win32_Processor reports VirtualizationFirmwareEnabled=False, VMMonitorModeExtensions=True, SecondLevelAddressTranslationExtensions=True. Hardware virtualization must be enabled in BIOS/UEFI by the owner before retrying Ubuntu installation. Sandbox has not run. No boot/firmware settings were changed.

Latest setup update: HypervisorPresent=True after owner BIOS change; do not interpret the masked Win32_Processor firmware flag alone as disabled virtualization when hypervisor is running. Online WSL catalog fetch stalled, so official Ubuntu 26.04.1 amd64 image was downloaded directly from the Microsoft catalog URL and SHA256 verified (48d56724b5c8e60f24893e83e73bbb58c60b3ca22fba3da977075420acd54104). Imported as NEAR-Ubuntu into artifacts/local/wsl-ubuntu. Linux x86_64 execution verified. Linux Node 24.16.0 downloaded and checksum verified; Sandbox dependency installation is running. Sandbox tests are still pending.

Latest runtime debugging: Ubuntu NEAR-Ubuntu starts and Linux Node is installed. The first real Sandbox run used bundled 2.6.2 and failed Wasm preparation (0/7). Official Sandbox 2.14.0 installed (binary SHA256 797b9d7a9a23907048d68a427e86a55c94f1de232dbfb8b8a1eec09ecef3bf13). Storage base increased to 512KiB because deployed code counts toward storage. Initialization and funding then ran, but expected error messages trapped because near-sdk-env 0.1.8 requires --cfg near for host panic calls. Added --cfg near plus target-cpu=mvp in .cargo/config.toml/build script and rebuilt successfully. The subsequent full test command stalled at WSL service level before results. Even ps/terminate stopped returning. Direct service restart denied; elevated recovery exited 1. Need Windows restart before resuming. Seven Sandbox tests have NOT passed. Next: check WSL responsiveness, run tests using pinned 2.14.0, fix actual failures, update stale historical claims and evidence only after results. No public deployment or real funds used.

RESOLVED: WSL works after restart. All nine Sandbox scenarios have now passed across the full seven-test run and two targeted successful runs. Resume with PostgreSQL development, not another reboot. Owner has Supabase but requested blank connection placeholders and independent work; do not connect to their remote database until configured.

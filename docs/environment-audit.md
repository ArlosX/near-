# Initial environment audit — 2026-11-02

Project root: D:/Arlos/Desktop/NEAR/near-agent-work. Existing sibling near-omni-agent implements a different multichain-wallet product and was not modified. Desktop is already under a parent Git repository; no nested repository was initialized and no unrelated files were staged.

Observed: Node v24.16.0, pnpm 11.25.0, Git available. Rust/Cargo, psql and Docker were not found in PATH; conventional cargo.exe path was absent. This does not prove no installation exists elsewhere.

Tests: node --test initially failed because process spawning was denied (EPERM). node --test --test-isolation=none tests/domain.test.mjs passed 9/9. TypeScript syntax checks and the labeled deterministic check fixture ran successfully.

Static typecheck: first dependency install failed network fetch, retry installed TypeScript 7.0.2 but its Windows platform executable could not be resolved. Portable 5.9.3 compiler installation is being verified; final status is recorded in validation.md.

No database migration, Rust build, Sandbox run, model call, wallet signature or chain transaction has been performed.

Financial milestone recheck (2026-11-02): cargo/rustc/rustup were not found in PATH; C:/Users/Arlos/.cargo/bin/cargo.exe and .rustup were absent. wsl.exe exists, but wsl --list --quiet returned installation/usage text with exit code 1, so no working Linux/Sandbox environment has been established. No installation or system modification was performed by this check.

Rust/WSL setup update (2026-11-02): downloaded official rustup-init from static.rust-lang.org and verified its SHA256. Installed workspace-local Rust 1.99.1 MSVC and GNU plus wasm32-unknown-unknown under artifacts/local/toolchain; system PATH was not changed. MSVC failed linking due missing msvcrt.lib in its expected import paths; GNU linked native tests successfully and built Wasm. Owner explicitly approved administrative WSL/Ubuntu installation after the first automatic permission review rejected it. The elevated installer later returned 0. Windows still reports optional component activation pending, and RebootPending is true. Do not report Ubuntu or Sandbox as working until after restart and verification.

#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
runtime="$project_root/artifacts/local/sandbox-2.14.0"
node="$project_root/artifacts/local/linux-tools/node-v24.16.0-linux-x64/bin/node"
export NEAR_SANDBOX_BIN_PATH="$runtime"
export NEAR_SANDBOX_BINARY_PATH="$runtime"
args=(--test --test-isolation=none --test-reporter=spec)
if [ "$#" -gt 0 ]; then args+=(--test-name-pattern="$1"); fi
"$node" "${args[@]}" "$project_root/tests/sandbox/escrow.test.mjs" 2>&1 | tee "$project_root/artifacts/local/sandbox-latest.log"

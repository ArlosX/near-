#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(uname -s)" = Linux ] || { echo 'Run inside Linux/WSL'; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo 'This setup targets Linux x86_64'; exit 1; }
for tool in curl tar xz sha256sum awk; do command -v "$tool" >/dev/null || { echo "Missing tool: $tool"; exit 1; }; done
linux_tools="$project_root/artifacts/local/linux-tools"
mkdir -p "$linux_tools"
node_dir="$linux_tools/node-v24.16.0-linux-x64"
if [ ! -x "$node_dir/bin/node" ]; then
 cd "$linux_tools"
 curl --fail --location --retry 2 --max-time 180 https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz -o node-v24.16.0-linux-x64.tar.xz
 curl --fail --location --retry 2 --max-time 60 https://nodejs.org/dist/v24.16.0/SHASUMS256.txt -o SHASUMS256.txt
 awk '$2=="node-v24.16.0-linux-x64.tar.xz"{print $0}' SHASUMS256.txt > node-checksum.txt
 test -s node-checksum.txt
 sha256sum --check node-checksum.txt
 tar -xJf node-v24.16.0-linux-x64.tar.xz
fi
export PATH="$node_dir/bin:$PATH"
node -e "if(process.platform!=='linux')throw Error('Linux Node required')"
cd "$project_root/tests/sandbox"
# Isolated from the application's Windows pnpm dependencies.
npm ci --no-audit --no-fund
runtime="$project_root/artifacts/local/sandbox-2.14.0"
if [ ! -x "$runtime/near-sandbox" ]; then
 bash "$project_root/scripts/install-sandbox-runtime.sh"
fi
export NEAR_SANDBOX_BIN_PATH="$runtime"
export NEAR_SANDBOX_BINARY_PATH="$runtime"
npm test

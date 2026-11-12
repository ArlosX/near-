#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
d="$project_root/artifacts/local/sandbox-2.14.0"
mkdir -p "$d"
curl -fL --retry 2 --max-time 180 https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/Linux-x86_64/2.14.0/near-sandbox.tar.gz -o "$d/sandbox.tar.gz"
tar -xzf "$d/sandbox.tar.gz" --strip-components=1 -C "$d"
"$d/near-sandbox" --version
sha256sum "$d/near-sandbox"

#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
project_root="$(cd "$(dirname "$0")/.." && pwd)"
node="$project_root/artifacts/local/linux-tools/node-v24.16.0-linux-x64/bin/node"
if ! pg_ctlcluster 18 main status >/dev/null; then
 # WSL crash recovery can exceed pg_ctlcluster's default startup timeout.
 # Do not kill recovery, remove PID files, reset data, or disable fsync.
 pg_ctlcluster --skip-systemctl-redirect 18 main start -- -t 300 || true
fi
for attempt in {1..300}; do
 if runuser -u postgres -- pg_isready -q -d near_agent_dev; then
  runuser -u postgres -- "$node" --test --test-isolation=none "$project_root/tests/postgres/postgres.test.mjs" 2>&1 | tee "$project_root/artifacts/local/postgres-latest.log"
  exit 0
 fi
 sleep 1
done
echo 'Local PostgreSQL did not become ready' >&2
exit 1

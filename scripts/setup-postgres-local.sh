#!/usr/bin/env bash
set -euo pipefail
# Dedicated LOCAL development database; never reads DATABASE_URL.
pg_ctlcluster 18 main start || pg_isready -q
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='near_agent_dev'" | grep -q 1; then
 runuser -u postgres -- createdb near_agent_dev
fi
project_root="$(cd "$(dirname "$0")/.." && pwd)"
node_dir="$project_root/artifacts/local/linux-tools/node-v24.16.0-linux-x64/bin"
cd "$project_root/tests/postgres"
export PATH="$node_dir:$PATH"
npm ci --ignore-scripts --no-audit --no-fund
runuser -u postgres -- "$node_dir/node" --test --test-isolation=none "$project_root/tests/postgres/postgres.test.mjs"

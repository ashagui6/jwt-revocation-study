#!/usr/bin/env bash

set -e

mkdir -p results
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

run_mode() {
  MODE_NAME="$1"
  ACCESS_TTL="$2"
  REFRESH_TTL="$3"

  echo
  echo "========================================"
  echo "Running mode: $MODE_NAME"
  echo "========================================"

  cat > .env <<EOF
MODE=$MODE_NAME
JWT_SECRET=replace_this_with_a_long_random_secret
ACCESS_TOKEN_TTL_SECONDS=$ACCESS_TTL
REFRESH_TOKEN_TTL_SECONDS=$REFRESH_TTL
EOF

  docker compose down
  docker compose up --build -d

  echo "Waiting for services..."
  sleep 8

  bash scripts/smoke-test.sh | tee "results/${TIMESTAMP}-${MODE_NAME}-smoke.txt"
  docker compose logs > "results/${TIMESTAMP}-${MODE_NAME}-logs.txt"
}

run_mode "stateless_long" "3600" "604800"
run_mode "short_refresh" "120" "604800"
run_mode "blacklist" "3600" "604800"

echo
echo "Done. Results saved in results/"
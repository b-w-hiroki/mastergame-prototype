#!/usr/bin/env bash
# ============================================================
# MasterGame — DB テストランナー
#   使い捨てDBに 全マイグレーション + seed + ハーネス を適用し、
#   supabase/tests/[0-9]*_test.sql を順に実行する。
#   いずれかのアサーションが失敗（RAISE EXCEPTION）したら非0で終了。
#
# 環境変数:
#   PGHOST/PGPORT/PGUSER/PGPASSWORD … 接続先（既定 localhost:5432/postgres）
#   TEST_DB … 作成するテストDB名（既定 mastergame_test）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
SEED="$ROOT/supabase/seed.sql"

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="postgres"
TEST_DB="${TEST_DB:-mastergame_test}"

psql -v ON_ERROR_STOP=1 -q -c "drop database if exists ${TEST_DB} with (force)"
psql -v ON_ERROR_STOP=1 -q -c "create database ${TEST_DB}"

run() { psql -v ON_ERROR_STOP=1 -q -d "${TEST_DB}" -f "$1"; }

echo "→ harness"
run "$TESTS/00_harness.sql"

echo "→ migrations"
for f in "$MIG"/0*.sql; do
  echo "   $(basename "$f")"
  run "$f"
done

echo "→ seed"
run "$SEED"

echo "→ tests"
fail=0
for f in "$TESTS"/[0-9]*_test.sql; do
  echo "== $(basename "$f") =="
  # ON_ERROR_STOP により、アサーション失敗（RAISE EXCEPTION）で psql が非0を返す。
  # NOTICE("ok - ...") を表示しつつ exit code で合否判定する。
  if psql -v ON_ERROR_STOP=1 -d "${TEST_DB}" -f "$f" 2>&1 | sed 's/^/   /'; then
    echo "   ✓ passed"
  else
    echo "   ✗ FAILED"; fail=1
  fi
done

psql -v ON_ERROR_STOP=1 -q -c "drop database if exists ${TEST_DB} with (force)" || true
if [ "$fail" != 0 ]; then echo "DB tests FAILED"; exit 1; fi
echo "All DB tests passed."

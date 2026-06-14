#!/usr/bin/env bash
# supabase/setup_all.sql を再生成（migrations 0001〜 + seed.sql を結合）。
# ブラウザの SQL Editor だけでセットアップしたい人向けの一括SQLを作る。
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=supabase/setup_all.sql
{
  echo "-- ============================================================"
  echo "-- MasterGame — 一括セットアップSQL（自動生成）"
  echo "-- Supabase Studio の SQL Editor にこの内容を全て貼り付けて Run。"
  echo "-- 内容 = migrations 全て ＋ seed.sql（この順で実行）。"
  echo "-- 新規プロジェクトで1回だけ実行してください。"
  echo "-- 再生成: scripts/build-setup-sql.sh"
  echo "-- ============================================================"
  echo
  for f in $(ls supabase/migrations/*.sql | sort) supabase/seed.sql; do
    echo
    echo "-- ┌────────────────────────────────────────────────────────"
    echo "-- │ $f"
    echo "-- └────────────────────────────────────────────────────────"
    cat "$f"
    echo
  done
} > "$OUT"
echo "生成: $OUT ($(wc -l < "$OUT") 行)"

#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDir = join(root, 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
if (migrationFiles.length === 0) throw new Error('マイグレーションが見つかりません');

const normalize = (value) => value.replace(/\r\n/g, '\n');
const header = [
  '-- ============================================================',
  '-- MasterGame — 一括セットアップSQL（自動生成）',
  '-- Supabase Studio の SQL Editor にこの内容を全て貼り付けて Run。',
  '-- 内容 = migrations 全て ＋ seed.sql（この順で実行）。',
  '-- 新規プロジェクトで1回だけ実行してください。',
  '-- 再生成: scripts/build-setup-sql.sh',
  '-- ============================================================',
].join('\n');

let expected = `${header}\n\n`;
for (const name of [...migrationFiles.map((file) => `supabase/migrations/${file}`), 'supabase/seed.sql']) {
  expected += '\n-- ┌────────────────────────────────────────────────────────\n';
  expected += `-- │ ${name}\n`;
  expected += '-- └────────────────────────────────────────────────────────\n';
  expected += normalize(readFileSync(join(root, ...name.split('/')), 'utf8'));
  expected += '\n';
}

const actual = normalize(readFileSync(join(root, 'supabase', 'setup_all.sql'), 'utf8'));
if (actual !== expected) {
  let offset = 0;
  while (offset < actual.length && offset < expected.length && actual[offset] === expected[offset]) offset++;
  const line = expected.slice(0, offset).split('\n').length;
  process.stderr.write(`setup_all.sql が migrations/seed と一致しません（行 ${line} 付近）。再生成して差分を確認してください。\n`);
  process.exit(1);
}
process.stdout.write(`setup_all.sql は ${migrationFiles.length} 件のmigrationとseedに一致します。\n`);

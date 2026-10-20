#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jobs = [
  ['仕様書と設計書の構造', '.', ['run', 'check:docs']],
  ['文書チェックの回帰テスト', '.', ['run', 'test:docs']],
  ['一括SQLとmigration/seedの一致', '.', ['run', 'check:setup-sql']],
  ['モバイルのテスト', 'apps/mobile', ['test', '--', '--runInBand', '--watch=false']],
  ['モバイルの型チェック', 'apps/mobile', ['run', 'typecheck']],
  ['モバイルのWeb出力', 'apps/mobile', ['run', 'export:web']],
  ['管理画面のテスト', 'apps/admin', ['test']],
  ['管理画面の型チェック', 'apps/admin', ['run', 'typecheck']],
  ['管理画面のビルド', 'apps/admin', ['run', 'build']],
  ['管理画面の未ログイン認証E2E', 'apps/admin', ['run', 'e2e']],
];

for (const [label, directory, args] of jobs) {
  process.stdout.write(`\n[check:local] ${label}\n`);
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd: join(root, directory), stdio: 'inherit',
    })
    : spawnSync('npm', args, {
    cwd: join(root, directory),
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(`[check:local] 失敗: ${label}${result.error ? ` (${result.error.message})` : ''}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write('\n[check:local] すべて成功しました。実DB・実機・外部サービスの検証は含みません。\n');

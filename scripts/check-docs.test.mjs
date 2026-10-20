import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { requiredDocumentChanges, validateDocuments } from './check-docs.mjs';

const product = '# MasterGame 現行機能仕様\n## 一般ユーザー向け機能\n## 運営向け機能\n## 完了と未完了の境界\n';
const architecture = '# MasterGame 現行技術設計\n## 構成と責務\n## 認証と権限境界\n## データと整合性\n';
const workflow = '# 仕様書と設計書の更新ワークフロー\n## 変更ごとの手順\n## 更新の完了条件\n';

function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), 'mastergame-docs-'));
  try {
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/PRODUCT_SPEC.md'), product);
    writeFileSync(join(root, 'docs/ARCHITECTURE.md'), architecture);
    writeFileSync(join(root, 'docs/DOCS_WORKFLOW.md'), workflow);
    callback(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('必要な見出しと存在する相対リンクを通す', () => fixture((root) => {
  writeFileSync(join(root, 'docs/PRODUCT_SPEC.md'), `${product}[設計](ARCHITECTURE.md#構成と責務)\n[外部](https://example.com)\n`);
  assert.deepEqual(validateDocuments(root), []);
}));

test('存在しない相対リンクと欠けた見出しを検出する', () => fixture((root) => {
  writeFileSync(join(root, 'docs/PRODUCT_SPEC.md'), '# MasterGame 現行機能仕様\n[不明](missing.md)\n');
  const errors = validateDocuments(root);
  assert.ok(errors.some((error) => error.includes('見出し')));
  assert.ok(errors.some((error) => error.includes('missing.md')));
}));

test('コードブロック内のリンク例は検査しない', () => fixture((root) => {
  writeFileSync(join(root, 'docs/PRODUCT_SPEC.md'), [product, '```md', '[例](not-a-file.md)', '```', ''].join('\n'));
  assert.deepEqual(validateDocuments(root), []);
}));

test('画面変更と内部・DB変更の更新先を分ける', () => {
  assert.deepEqual(requiredDocumentChanges(['apps/mobile/app/login.tsx']), ['docs/PRODUCT_SPEC.md']);
  assert.deepEqual(requiredDocumentChanges(['supabase/migrations/0036.sql']), ['docs/ARCHITECTURE.md']);
  assert.deepEqual(requiredDocumentChanges(['apps/admin/app/page.tsx', 'apps/admin/lib/admin-check.ts']),
    ['docs/PRODUCT_SPEC.md', 'docs/ARCHITECTURE.md']);
  assert.deepEqual(requiredDocumentChanges(['apps/mobile/__tests__/login.test.tsx', 'docs/PRODUCT_SPEC.md']), []);
});

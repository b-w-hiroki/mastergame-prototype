#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  ['docs/PRODUCT_SPEC.md', ['# MasterGame 現行機能仕様', '## 一般ユーザー向け機能', '## 運営向け機能', '## 完了と未完了の境界']],
  ['docs/ARCHITECTURE.md', ['# MasterGame 現行技術設計', '## 構成と責務', '## 認証と権限境界', '## データと整合性']],
  ['docs/DOCS_WORKFLOW.md', ['# 仕様書と設計書の更新ワークフロー', '## 変更ごとの手順', '## 更新の完了条件']],
];

export function validateDocuments(rootDir) {
  const errors = [];
  for (const [path, headings] of required) {
    const absolute = join(rootDir, path);
    if (!existsSync(absolute)) { errors.push(`${path} がありません`); continue; }
    const body = readFileSync(absolute, 'utf8');
    const lines = body.split(/\r?\n/);
    for (const heading of headings) {
      if (!lines.includes(heading)) errors.push(`${path} に見出し「${heading}」がありません`);
    }
    const prose = body.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '');
    for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, '');
      if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
      let pathname;
      try { pathname = decodeURIComponent(target.split('#')[0].split('?')[0]); }
      catch { errors.push(`${path} に不正なリンクがあります: ${target}`); continue; }
      const linked = resolve(dirname(absolute), pathname);
      if (!existsSync(linked) || !statSync(linked).isFile()) errors.push(`${path} のリンク先がありません: ${target}`);
    }
  }
  return errors;
}

export function requiredDocumentChanges(changedPaths) {
  const needed = new Set();
  for (const raw of changedPaths) {
    const path = raw.replaceAll('\\', '/');
    if (/(?:^|\/)(?:__tests__|e2e)\//.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) continue;
    if (/^apps\/(?:mobile|admin)\/app\//.test(path)) needed.add('docs/PRODUCT_SPEC.md');
    if (/^apps\/(?:mobile\/src|admin\/lib)\//.test(path)
      || /^supabase\/(?:migrations|functions)\//.test(path)
      || /^packages\//.test(path)) needed.add('docs/ARCHITECTURE.md');
  }
  return [...needed];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateDocuments(root);
  const baseIndex = process.argv.indexOf('--base');
  if (baseIndex >= 0) {
    const base = process.argv[baseIndex + 1];
    if (!base || !/^[0-9a-f]{40}$/i.test(base)) errors.push('--base には比較元のコミット SHA を指定してください');
    else {
      try {
        const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
          .split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll('\\', '/'));
        for (const document of requiredDocumentChanges(changed)) {
          if (!changed.includes(document)) errors.push(`コード変更に対応する ${document} の更新がありません`);
        }
      } catch { errors.push('比較元コミットとの差分を取得できませんでした'); }
    }
  }
  if (errors.length) {
    for (const error of errors) process.stderr.write(`[check:docs] ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('[check:docs] 文書構造・相対リンク・更新差分の検査に成功しました。内容の正確さはレビューで確認してください。\n');
  }
}

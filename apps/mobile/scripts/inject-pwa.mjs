// expo export -p web（output: single）後に、dist/index.html へ PWA タグを注入する。
// single 出力では app/+html.tsx が使われないため、manifest リンク・apple メタ・
// Service Worker 登録をこのスクリプトで後付けする（冪等）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'dist', 'index.html');

if (!existsSync(file)) {
  console.error('dist/index.html が見つかりません。先に `expo export -p web` を実行してください。');
  process.exit(1);
}

let html = readFileSync(file, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('[inject-pwa] PWA タグは既に存在します。スキップ。');
  process.exit(0);
}

const TAGS = `
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="MasterGame" />
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(e){console.warn('[PWA] SW registration failed:',e);});});}</script>
  </head>`;

if (!html.includes('</head>')) {
  console.error('[inject-pwa] </head> が見つからず注入できませんでした。');
  process.exit(1);
}

html = html.replace('</head>', TAGS);
writeFileSync(file, html);
console.log('[inject-pwa] dist/index.html に PWA タグを注入しました。');

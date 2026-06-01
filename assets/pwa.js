/* MasterGame プロトタイプ — PWA 登録スクリプト
   どの階層のページから読み込んでも、サイトのルートに置いた
   service-worker.js を正しいスコープで登録する。
   ルートは <link rel="manifest"> の絶対 URL から逆算するため、
   GitHub Pages のサブパス配信でもカスタムドメインでも動作する。 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var link = document.querySelector('link[rel="manifest"]');
  var root = link
    ? link.href.replace(/manifest\.webmanifest.*$/, '')
    : (location.origin + '/');

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register(root + 'service-worker.js', { scope: root })
      .catch(function (err) {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
})();

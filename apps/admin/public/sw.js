/* MasterGame 運営コンソール — Service Worker
   運営データは機微なため HTML（ナビゲーション）はキャッシュせず network-first。
   オフライン時は offline.html にフォールバック。静的アセットのみ stale-while-revalidate。
   更新時は CACHE のバージョンを上げる。 */
const CACHE = 'mg-admin-v1';
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ページ遷移：network-first（キャッシュしない）→ 失敗時のみ offline.html
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  // 静的アセットのみ stale-while-revalidate（ビルド成果物・アイコン）
  const isStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      /\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname));

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // それ以外（API・動的データ等）はキャッシュせず素通し
});

/* Service worker: makes the portal installable. Never caches /api (always live data); pages and icons are network-first with an offline fallback. */
var CACHE = 'qp-shell-v1', SHELL = ['/', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok && (r.mode === 'navigate' || u.pathname.indexOf('/icons/') === 0)) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r.mode === 'navigate' ? '/' : r, copy); }); }
    return res;
  }).catch(function () { return caches.match(r.mode === 'navigate' ? '/' : r); }));
});

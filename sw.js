/* COLLYWOOD — service worker v8
   Lancement instantané : la page vient du cache immédiatement,
   la nouvelle version se télécharge en arrière-plan et s'active
   automatiquement (l'app se recharge une fois, toute seule). */
var CACHE = 'collywood-v8';
var CORE = ['./', 'logo.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.map(function (k) {
          if (k !== CACHE && k !== 'cw-dl') return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net') {
      e.respondWith(
        caches.match(req).then(function (hit) {
          return hit || fetch(req).then(function (r) {
            var cp = r.clone();
            caches.open(CACHE).then(function (c) { c.put(req, cp); });
            return r;
          });
        })
      );
    }
    return;
  }

  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      e.respondWith(
        caches.match('./').then(function (hit) {
          var net = fetch(req).then(function (r) {
            var cp = r.clone();
            caches.open(CACHE).then(function (c) { c.put('./', cp); });
            return r;
          }).catch(function () { return hit; });
          return hit || net;
        })
      );
    } else {
      e.respondWith(
        fetch(req).catch(function () { return caches.match(req); })
      );
    }
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (r) {
        var cp = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, cp); });
        return r;
      });
    })
  );
});

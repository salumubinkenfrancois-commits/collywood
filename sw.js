/* COLLYWOOD — service worker v3
   Lancement instantané : la page vient du cache immédiatement,
   la nouvelle version se télécharge en arrière-plan et s'active
   automatiquement (l'app se recharge une fois, toute seule). */
var CACHE = 'collywood-v4';
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
          if (k !== CACHE) return caches.delete(k);
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
    /* Bibliothèques CDN : cache d'abord (lancement instantané) */
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
    return; /* Supabase (API), CinetPay, HLS : jamais touchés */
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./').then(function (hit) {
        var net = fetch(req).then(function (r) {
          var cp = r.clone();
          caches.open(CACHE).then(function (c) { c.put('./', cp); });
          return r;
        }).catch(function () { return hit; });
        return hit || net;   /* cache instantané, sinon réseau */
      })
    );
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

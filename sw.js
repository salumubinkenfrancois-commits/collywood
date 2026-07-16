/* COLLYWOOD — service worker v1
   Stratégie : réseau d'abord pour la page (toujours à jour),
   cache en secours (hors-ligne), jamais d'interception
   des appels Supabase / CinetPay / vidéos (autres origines). */
var CACHE = 'collywood-v1';
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
  if (url.origin !== location.origin) return; /* Supabase, CinetPay, HLS : jamais touchés */

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var cp = r.clone();
        caches.open(CACHE).then(function (c) { c.put('./', cp); });
        return r;
      }).catch(function () { return caches.match('./'); })
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

/* Service worker : l'appli s'ouvre même sans réseau, et prend la nouvelle version dès qu'il y en a une. */
const CACHE = "heures-v1";
const SHELL = ["./", "index.html", "lib/jspdf-2.5.1.umd.min.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const CDN = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("heures-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.includes(url.hostname)) return;
  if (same) {
    // fichiers de l'appli : d'abord le réseau (pour avoir les mises à jour), sinon la copie gardée
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
  } else {
    // polices : la copie gardée, rafraîchie en arrière-plan
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// ══════════════════════════════════════════════════════════
// SERVICE WORKER — Mots-Lierre
// Stratégie :
//   • Shell (HTML, JS Firebase) → cache-first avec revalidation
//   • ODS.txt                  → cache-first (fichier lourd, stable)
//   • Google Fonts              → cache-first
//   • Firebase API              → réseau uniquement (toujours online)
// ══════════════════════════════════════════════════════════

const VERSION   = 'mots-lierre-v1';
const SHELL     = 'mots-lierre-shell-v1';
const DICT      = 'mots-lierre-dict-v1';
const FONTS     = 'mots-lierre-fonts-v1';

// Fichiers à précacher au moment de l'install
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
];

// ── Install : précache du shell ───────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate : purge des anciens caches ──────────────────
self.addEventListener('activate', event => {
  const keep = new Set([SHELL, DICT, FONTS]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch : routage par stratégie ────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase Firestore & Auth → réseau uniquement, pas de cache
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com')
  ) {
    return; // laisser le navigateur gérer
  }

  // ODS.txt → cache-first (très lourd, ne change pas)
  if (url.pathname.endsWith('ODS.txt')) {
    event.respondWith(cacheFirst(event.request, DICT));
    return;
  }

  // Google Fonts → cache-first
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(event.request, FONTS));
    return;
  }

  // Shell (HTML, manifest, icônes) → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request, SHELL));
});

// ── Stratégie cache-first ─────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Hors ligne — ressource non disponible', { status: 503 });
  }
}

// ── Stratégie stale-while-revalidate ─────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Hors ligne', { status: 503 });
}

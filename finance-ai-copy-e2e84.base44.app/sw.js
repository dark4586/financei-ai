const CACHE_NAME = 'financeai-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Network-first strategy: tenta rede, cai no cache se offline
self.addEventListener('fetch', (event) => {
    // Só intercepta GET do mesmo origin
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(event.request)
        .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
        })
        .catch(() => caches.match(event.request))
    );
});
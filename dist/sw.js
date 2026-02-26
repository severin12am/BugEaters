const CACHE_NAME = 'bugeaters-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']); 
    })
  );
});

self.addEventListener('fetch', (event) => {
  // CRITICAL FIX: Bypass the Service Worker completely for multiplayer server requests
  if (event.request.url.includes(':2567')) {
    return; // Lets the browser handle the connection natively
  }

  // Standard offline caching for everything else (images, scripts)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
      // Offline fallback
    })
  );
});
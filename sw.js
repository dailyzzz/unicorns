const CACHE_VERSION = 'antichrist-v1.0.0';
const CACHE_NAMES = {
  app: `${CACHE_VERSION}-app`,
  audio: `${CACHE_VERSION}-audio`,
  lyrics: `${CACHE_VERSION}-lyrics`
};

const APP_SHELL = [
  'index.html',
  'manifest.json',
  'favicon.ico'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAMES.app)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('antichrist-') && !Object.values(CACHE_NAMES).includes(name))
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: intelligent caching by resource type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // App shell - cache-first
  if (APP_SHELL.some(path => url.pathname === path || url.pathname.endsWith(path))) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // Audio files - cache then network
  if (url.pathname.includes('/tracks-') && url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(CACHE_NAMES.audio)
        .then(cache => {
          return cache.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('[SW] Serving audio from cache:', url.pathname);
                return cachedResponse;
              }

              return fetch(event.request)
                .then(response => {
                  if (response && response.status === 200) {
                    console.log('[SW] Caching audio:', url.pathname);
                    cache.put(event.request, response.clone());
                  }
                  return response;
                })
                .catch(error => {
                  console.error('[SW] Audio fetch failed:', error);
                  throw error;
                });
            });
        })
    );
    return;
  }

  // Lyrics - cache on demand
  if (url.pathname.includes('/lyrics-') && url.pathname.endsWith('.md')) {
    event.respondWith(
      caches.open(CACHE_NAMES.lyrics)
        .then(cache => {
          return cache.match(event.request)
            .then(cachedResponse => {
              const fetchPromise = fetch(event.request)
                .then(response => {
                  if (response && response.status === 200) {
                    cache.put(event.request, response.clone());
                  }
                  return response;
                });

              return cachedResponse || fetchPromise;
            });
        })
    );
    return;
  }

  // Everything else - network-first
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data.type === 'getCacheInfo') {
    getCacheStats().then(stats => {
      event.ports[0].postMessage(stats);
    });
  }

  if (event.data.action === 'getCacheStats') {
    getCacheStats().then(stats => {
      event.ports[0].postMessage(stats);
    });
  }

  if (event.data.action === 'clearAudioCache') {
    caches.delete(CACHE_NAMES.audio).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }

  if (event.data.action === 'preCacheTrack') {
    const url = event.data.url;
    caches.open(CACHE_NAMES.audio).then(cache => {
      cache.add(url).catch(() => {
        console.log('[SW] Pre-cache failed for:', url);
      });
    });
  }
});

// Helper: Get cache statistics
async function getCacheStats() {
  const audioCache = await caches.open(CACHE_NAMES.audio);
  const audioKeys = await audioCache.keys();

  const lyricsCache = await caches.open(CACHE_NAMES.lyrics);
  const lyricsKeys = await lyricsCache.keys();

  return {
    audioCount: audioKeys.length,
    audioCached: audioKeys.length,
    lyricsCached: lyricsKeys.length,
    totalCached: audioKeys.length + lyricsKeys.length
  };
}

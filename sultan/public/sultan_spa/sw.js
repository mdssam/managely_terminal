const CACHE_NAME = 'sultan-pos-v1779741748496';
const URLS_TO_CACHE = [
  "/sultan_spa/",
  "/assets/sultan/sultan_spa/favicon.png",
  "/assets/sultan/sultan_spa/favicon.ico",
  "/assets/sultan/sultan_spa/manifest.json",
  "/assets/sultan/logo.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap",
  "/assets/sultan/sultan_spa/assets/index-BuySlV16.js",
  "/assets/sultan/sultan_spa/assets/index-DmKHGXHC.css"
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => {
				console.log('[Service Worker] Pre-caching files');
				return cache.addAll(URLS_TO_CACHE);
			})
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(cacheNames => {
			return Promise.all(
				cacheNames.map(cache => {
					if (cache !== CACHE_NAME) {
						console.log('[Service Worker] Clearing old cache:', cache);
						return caches.delete(cache);
					}
				})
			);
		}).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);

	// Intercept navigation requests to /sultan_spa or its subpaths, serving the main entry HTML
	if (event.request.mode === 'navigate' && url.pathname.startsWith('/sultan_spa')) {
		event.respondWith(
			caches.match('/sultan_spa/').then(response => {
				return response || fetch(event.request);
			})
		);
		return;
	}

	// Cache-first strategy for static assets, local resources, and external fonts
	const isStaticAsset = url.pathname.includes('/assets/') || 
	                      url.hostname.includes('fonts.gstatic.com') || 
	                      url.hostname.includes('fonts.googleapis.com');

	if (isStaticAsset) {
		event.respondWith(
			caches.match(event.request).then(cachedResponse => {
				if (cachedResponse) {
					return cachedResponse;
				}
				return fetch(event.request).then(response => {
					if (response && response.status === 200) {
						const responseToCache = response.clone();
						caches.open(CACHE_NAME).then(cache => {
							cache.put(event.request, responseToCache);
						});
					}
					return response;
				});
			})
		);
		return;
	}

	// Default: network-first, with fallback to cache for offline availability
	event.respondWith(
		fetch(event.request).catch(() => {
			return caches.match(event.request);
		})
	);
});

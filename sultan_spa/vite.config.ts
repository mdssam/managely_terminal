import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import proxyOptions from './proxyOptions';

// Custom plugin to generate service worker at the end of the build
const generateSW = () => {
	return {
		name: 'generate-sw',
		closeBundle() {
			const publicDir = path.resolve(__dirname, '../sultan/public');
			const spaDir = path.resolve(publicDir, 'sultan_spa');
			const assetsDir = path.resolve(spaDir, 'assets');

			let assets: string[] = [];
			if (fs.existsSync(assetsDir)) {
				assets = fs.readdirSync(assetsDir).map(file => `/assets/sultan/sultan_spa/assets/${file}`);
			}

			const cacheName = `sultan-pos-v${Date.now()}`;
			const urlsToCache = [
				'/assets/sultan/sultan_spa/index.html',
				'/assets/sultan/sultan_spa/favicon.png',
				'/assets/sultan/sultan_spa/favicon.ico',
				'/assets/sultan/sultan_spa/manifest.json',
				'/assets/sultan/sultan_spa/icon-192x192-v2.png',
				'/assets/sultan/sultan_spa/icon-512x512-v2.png',
				'/assets/sultan/logo.png',
				'/assets/sultan/sultan_spa/fonts/inter-latin.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-400-arabic.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-400-latin.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-500-arabic.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-500-latin.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-700-arabic.woff2',
				'/assets/sultan/sultan_spa/fonts/tajawal-700-latin.woff2',
				...assets
			];

const swContent = `const CACHE_NAME = '${cacheName}';
const URLS_TO_CACHE = ${JSON.stringify(urlsToCache, null, 2)};

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => {
				console.log('[SW] Pre-caching static assets...');
				return Promise.all(
					URLS_TO_CACHE.map(url =>
						fetch(url)
							.then(response => {
								if (!response.ok) {
									console.warn('[SW] Skipping failed pre-cache:', url, response.status);
									return;
								}
								return cache.put(url, response);
							})
							.catch(err => console.warn('[SW] Pre-cache fetch error:', url, err))
					)
				);
			})
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(cacheNames => Promise.all(
				cacheNames
					.filter(name => name !== CACHE_NAME)
					.map(name => {
						console.log('[SW] Deleting old cache:', name);
						return caches.delete(name);
					})
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);

	const isSameOrigin = url.origin === self.location.origin;
	const isAllowedCrossOrigin = 
		url.hostname.includes('fonts.gstatic.com') || 
		url.hostname.includes('fonts.googleapis.com');

	// Only handle GET requests from same origin or trusted cross-origin CDNs
	if (event.request.method !== 'GET' || (!isSameOrigin && !isAllowedCrossOrigin)) {
		return;
	}

	// ── Sultan / Auth API calls — Network First with Cache fallback ──────────
	// Cache GET responses from our backend so the app works offline.
	// POST / non-GET calls are passed through as-is (they'll fail offline).
	const isCacheableApi = 
		url.pathname.startsWith('/api/method/sultan.') || 
		url.pathname === '/api/method/frappe.auth.get_logged_user' || 
		url.pathname.startsWith('/api/resource/User/');

	if (isCacheableApi) {
		event.respondWith(
			fetch(event.request.clone())
				.then(response => {
					// Only cache successful JSON responses
					if (response && response.status === 200 && response.type === 'basic') {
						const responseToCache = response.clone();
						caches.open(CACHE_NAME)
							.then(cache => cache.put(event.request, responseToCache))
							.catch(() => {});
					}
					return response;
				})
				.catch(async () => {
					// Offline — serve stale cached response if available
					const cached = await caches.match(event.request);
					if (cached) {
						console.log('[SW] Offline API fallback:', url.pathname);
						return cached;
					}
					// Special fallback for session verification so client doesn't think session has expired
					if (url.pathname === '/api/method/frappe.auth.get_logged_user') {
						// Return empty response rather than error if no cache exists
						return new Response(
							JSON.stringify({ message: null }),
							{ status: 200, headers: { 'Content-Type': 'application/json' } }
						);
					}
					// No cache — return empty success response so app doesn't crash
					return new Response(
						JSON.stringify({ message: { success: false, error: 'offline', data: [] } }),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					);
				})
		);
		return;
	}

	// Skip all other Frappe API/core calls — let them fail naturally when offline
	if (url.pathname.startsWith('/api/')) {
		return;
	}

	// ── Navigation requests (the HTML page) ──────────────────────────────────
	// Strategy: Serve pre-cached index.html shell instantly (fast), fetch fresh in background.
	if (event.request.mode === 'navigate' && url.pathname.startsWith('/sultan_spa')) {
		event.respondWith(
			caches.match('/assets/sultan/sultan_spa/index.html').then(cachedRes => {
				const networkFetch = fetch(event.request)
					.then(response => {
						if (response && response.status === 200 && response.type === 'basic') {
							const responseToCache = response.clone();
							caches.open(CACHE_NAME)
								.then(cache => cache.put('/assets/sultan/sultan_spa/index.html', responseToCache));
							console.log('[SW] Navigation response cached for offline use.');
						}
						return response;
					})
					.catch(() => {
						if (cachedRes) {
							console.log('[SW] Offline: serving cached HTML shell.');
							return cachedRes;
						}
						return new Response(
							'<html><head><title>Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>You are offline</h2><p>Please connect to the internet and refresh the page.</p></body></html>',
							{ status: 200, headers: { 'Content-Type': 'text/html' } }
						);
					});

				if (cachedRes) {
					networkFetch.catch(() => {}); // don't let background update crash anything
					return cachedRes;
				}
				return networkFetch;
			})
		);
		return;
	}

	// ── Static assets & Images ────────────────────────────────────────────────
	// Strategy: Cache-first (assets are hashed or static media, cache is always fresh)
	const isStaticAsset =
		url.pathname.includes('/assets/') ||
		url.pathname.includes('/files/') ||
		url.pathname.includes('/private/files/') ||
		isAllowedCrossOrigin ||
		/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(url.pathname);

	if (isStaticAsset) {
		event.respondWith(
			caches.match(event.request).then(cached => {
				if (cached) return cached;
				return fetch(event.request).then(response => {
					if (response && response.status === 200) {
						const responseToCache = response.clone();
						caches.open(CACHE_NAME)
							.then(cache => cache.put(event.request, responseToCache));
					}
					return response;
				}).catch(() => new Response('', { status: 503 }));
			})
		);
		return;
	}

	// ── Default: network-first ────────────────────────────────────────────────
	event.respondWith(
		fetch(event.request).catch(() => caches.match(event.request))
	);
});
`;

			// Write inside the sultan_spa asset dir so Nginx serves it at
			// /assets/sultan/sultan_spa/sw.js — registered with explicit scope below
			fs.writeFileSync(path.resolve(spaDir, 'sw.js'), swContent);
			console.log('Service worker sw.js generated successfully at build time.');
		}
	};
};

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), generateSW()],
	server: {
		port: 8080,
		host: '0.0.0.0',
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	build: {
		outDir: '../sultan/public/sultan_spa',
		emptyOutDir: true,
		target: 'es2015',
	},
});



// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';
// import { fileURLToPath, URL } from 'url';

// // https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   resolve: {
//     alias: {
//       '@': fileURLToPath(new URL('./src', import.meta.url))
//     },
//   },
//   server: {
//     proxy: {
//       '/api': {
//         target: 'https://m-alnakheel-test.frappe.cloud',
//         changeOrigin: true,
//         secure: true,
//         configure: (proxy, _options) => {
//           proxy.on('error', (err, _req, _res) => {
//             console.log('proxy error', err);
//           });
//           proxy.on('proxyReq', (proxyReq, req, _res) => {
//             console.log('Sending Request to the Target:', req.method, req.url);
//           });
//           proxy.on('proxyRes', (proxyRes, req, _res) => {
//             console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
//           });
//         },
//       }
//     }
//   }
// });

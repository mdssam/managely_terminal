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
				'/sultan_spa/',
				'/assets/sultan/sultan_spa/favicon.png',
				'/assets/sultan/sultan_spa/favicon.ico',
				'/assets/sultan/sultan_spa/manifest.json',
				'/assets/sultan/logo.png',
				'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap',
				...assets
			];

			const swContent = `const CACHE_NAME = '${cacheName}';
const URLS_TO_CACHE = ${JSON.stringify(urlsToCache, null, 2)};

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
`;

			fs.writeFileSync(path.resolve(publicDir, 'sw.js'), swContent);
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

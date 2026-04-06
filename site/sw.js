// Service worker for grainulator.app PWA
// Stale-while-revalidate: serve cached version instantly, update in background

const CACHE = "grainulator-v8";
const ASSETS = [
	"/",
	"/index.html",
	"/demos.json",
	"/glitchy.png",
	"/manifest.json",
	"/favicon-32.png",
	"/favicon-64.png",
	"/og-image.png",
];

self.addEventListener("install", (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
	self.skipWaiting();
});

self.addEventListener("activate", (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
				),
			),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (e) => {
	// Stale-while-revalidate: serve cache, update in background
	e.respondWith(
		caches.match(e.request).then((cached) => {
			const fetchPromise = fetch(e.request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE).then((c) => c.put(e.request, clone));
					}
					return response;
				})
				.catch(() => cached);
			return cached || fetchPromise;
		}),
	);
});

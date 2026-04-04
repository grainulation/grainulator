// Service worker for grainulator.app PWA
// Caches the single-page site for offline access

const CACHE = "grainulator-v2";
const ASSETS = [
	"/",
	"/index.html",
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
	e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

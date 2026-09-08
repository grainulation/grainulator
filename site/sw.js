// Cache only same-origin static GETs. Model requests never enter the cache.
const CACHE = "grainulator-static-v16";
const ASSETS = [
	"/",
	"/index.html",
	"/glitchy-56.png",
	"/manifest.json",
	"/favicon-32.png",
	"/favicon-64.png",
	"/og-image.png",
];
self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
	self.skipWaiting();
});
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith("grainulator-") && key !== CACHE)
						.map((key) => caches.delete(key)),
				),
			),
	);
	self.clients.claim();
});
self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	if (!ASSETS.includes(url.pathname) || url.search) return;
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			try {
				const response = await fetch(request);
				if (response.ok) await cache.put(request, response.clone());
				return response;
			} catch {
				return (
					(await cache.match(request)) ||
					new Response("Offline. Reconnect to load this page.", {
						status: 503,
						headers: { "Content-Type": "text/plain" },
					})
				);
			}
		})(),
	);
});

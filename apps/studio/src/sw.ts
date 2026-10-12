/**
 * The Studio's service worker: keeps the whole app in a cache so it starts offline. Cache first; a new Studio is
 * installed in the background and waits until the author chooses to reload (the page asks it to take over).
 * The build fills in the file list and the version.
 */
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

interface ExtendableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEvent extends ExtendableEvent { request: Request; respondWith(r: Promise<Response> | Response): void }
interface Worker {
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  registration: { scope: string };
}
const sw = self as unknown as Worker;
const CACHE = `libka-studio-${__VERSION__}`;
const scope = () => new URL(sw.registration.scope);

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(__PRECACHE__.map((p) => new URL(p, scope()).href))));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('libka-studio-') && key !== CACHE) await caches.delete(key);
    await sw.clients.claim();
  })());
});

sw.addEventListener('message', (e) => { if (e.data === 'activate') void sw.skipWaiting(); });

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope().origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // every page of the Studio is the one app shell
    const hit = req.mode === 'navigate' ? await cache.match(new URL('index.html', scope()).href) : await cache.match(req, { ignoreSearch: true });
    // a host may answer index.html with a redirect (Cloudflare: /index.html → /), and a browser refuses a redirected
    // response for a page load: give it the same file as a plain response
    if (hit?.redirected) return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers });
    return hit ?? fetch(req);
  })());
});

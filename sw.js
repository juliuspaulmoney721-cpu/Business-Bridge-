const CACHE = 'pixora-v10';
const OLD_CACHES = ['pixora-v1','pixora-v2','pixora-v3','pixora-v4','pixora-v5','pixora-v6','pixora-v7','pixora-v8','pixora-v9'];
const ASSETS = [
  './','index.html','dashboard.html','search.html','create.html','messages.html','chat.html',
  'notifications.html','profile.html','login.html','signup.html','styles.css','supabase.js',
  'pixora-api.js','pixora-cloud.js','app.js','manifest.json','icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('pixora-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin){
    event.respondWith(fetch(event.request));
    return;
  }

  // Always prefer the network for application source files so an old
  // GitHub Pages cache cannot keep serving a broken JavaScript build.
  const source = /\.(html|js|css)$/.test(url.pathname);
  if(source){
    event.respondWith(
      fetch(event.request, {cache:'no-store'})
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

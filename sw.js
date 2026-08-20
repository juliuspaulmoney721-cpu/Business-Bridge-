const CACHE="business-bridge-v1";
const ASSETS=["./","dashboard.html","index.html","search.html","create.html","messages.html","notifications.html","profile.html","connect.html","login.html","signup.html","business.html","creators.html","students.html","ai.html","chat.html","styles.css","supabase.js","manifest.json","icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match("dashboard.html")))});

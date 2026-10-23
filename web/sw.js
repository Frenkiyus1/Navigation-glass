const CACHE='navi-glass-shell-v1';
const SHELL=['/','/index.html','/styles.css','/app.js','/navigation.mjs','/bluetooth.mjs','/icon.svg','/manifest.webmanifest','/vendor/leaflet.js','/vendor/leaflet.css','/data/demo-route.json','/config.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('navi-glass-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never prefetch, proxy or bulk-cache public map tiles, searches or routes.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{const cached=await caches.match(event.request);return cached||new Response('Offline',{status:503});}));
});

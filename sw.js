const CACHE='fabama-v2';
const ASSETS=['/','/index.html','/app.js','/manifest.json','/icon-192.png','/icon-512.png','/assets/logo.webp','/assets/fond.webp','/assets/favicon.png',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js','https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

// Network-first : toujours essayer le réseau d'abord, cache en secours
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.url.includes('supabase.co'))return; // ne pas cacher les appels API
  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const clone=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,clone));
        return r;
      })
      .catch(()=>caches.match(e.request))
  );
});

self.addEventListener('message',e=>{
  if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});

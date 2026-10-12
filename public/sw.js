/* Athave AI V12 – static assets only. Never cache customer data, API, sessions, payments or uploaded images. */
const CACHE='athave-static-v12-favicon-20261012';
const STATIC=['/offline.html','/favicon.png','/favicon-48.png','/favicon.ico','/styles.css','/app.js','/admin.js','/pwa.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png','/assets/unicorn-transparent.webp','/assets/athave-logo.webp'];
const ASSETS=new Set(STATIC);
self.addEventListener('install',event=>{event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(STATIC);await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith('athave-static-')&&n!==CACHE).map(n=>caches.delete(n)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const r=event.request;
 if(r.method!=='GET'||r.cache==='no-store')return;
 const url=new URL(r.url);
 if(url.origin!==self.location.origin || url.pathname.startsWith('/api/'))return;
 // HTML navigations are always network-only; offline page contains no user data.
 if(r.mode==='navigate'){
  event.respondWith(fetch(r).catch(async()=>await caches.match('/offline.html')||Response.error()));return;
 }
 // Cache exactly the static resources we know, never unexpected server responses.
 if(!ASSETS.has(url.pathname))return;
 event.respondWith((async()=>{
  const hit=await caches.match(url.pathname);
  if(hit)return hit;
  const response=await fetch(r);
  if(response.ok && response.type==='basic'){
   const cache=await caches.open(CACHE); await cache.put(url.pathname,response.clone());
  }
  return response;
 })());
});

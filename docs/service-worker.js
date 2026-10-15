// Static hosting isolation and lossless gzip transport. No save data is cached here.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function serve(request) {
  const url = new URL(request.url);
  const root = new URL(self.registration.scope);
  const name = url.pathname.slice(root.pathname.length);
  let response;
  if (url.origin === root.origin && ['tanoshi-boken.mkxpz', 'mkxp-z_libretro.wasm'].includes(name)) {
    const manifest = fetch(new URL('asset-manifest.json', root), {cache: 'no-cache'})
      .then(r => { if (!r.ok) throw Error('Asset manifest: ' + r.status); return r.json(); });
    const asset = (await manifest)[name];
    const compressed = await fetch(new URL(asset.file, root));
    if (!compressed.ok) throw new Error('Asset download failed: ' + compressed.status);
    response = new Response(compressed.body.pipeThrough(new DecompressionStream('gzip')), {
      headers: {'Content-Type': name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        'Content-Length': String(asset.size)}
    });
  } else {
    response = await fetch(request);
  }
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
self.addEventListener('fetch', event => {
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
  event.respondWith(serve(event.request));
});

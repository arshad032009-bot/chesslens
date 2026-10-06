/** WASM must be served as application/wasm; engine files are static and may be cached. No COOP/COEP needed (single-thread build). */
module.exports = {
  async headers() {
    return [
      { source: '/engine/:path*.wasm', headers: [{ key: 'Content-Type', value: 'application/wasm' }, { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/engine/:path*.js', headers: [{ key: 'Content-Type', value: 'application/javascript; charset=utf-8' }, { key: 'Cache-Control', value: 'public, max-age=3600' }] },
    ];
  },
};

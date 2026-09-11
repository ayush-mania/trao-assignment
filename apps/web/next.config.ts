import type { NextConfig } from 'next';

// The browser only ever talks to this origin: /api/* is proxied to the Express API server-side, so
// the session cookie is first-party and no browser's third-party-cookie policy can drop it.
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_PROXY_TARGET}/:path*` }];
  },
};

export default nextConfig;

import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@gestor/shared'],
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/:path*` }]; },
};
export default nextConfig;

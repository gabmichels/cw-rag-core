/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ensure workspace packages get transpiled by Next/SWC
  transpilePackages: ['@cw-rag-core/shared', '@cw-rag-core/retrieval', '@cw-rag-core/ingestion-sdk'],
  // optional: quiet noisy warnings
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
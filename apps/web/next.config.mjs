/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.FIREBASE_DEPLOYMENT === 'true' ? 'export' : 'standalone',
  trailingSlash: true,
  images: {
    unoptimized: process.env.FIREBASE_DEPLOYMENT === 'true'
  },
  // ensure workspace packages get transpiled by Next/SWC
  transpilePackages: ['@cw-rag-core/shared', '@cw-rag-core/retrieval', '@cw-rag-core/ingestion-sdk'],
  // optional: quiet noisy warnings
  typescript: { ignoreBuildErrors: false },
  // Environment variables for build-time configuration
  env: {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_TENANT_ID: process.env.NEXT_PUBLIC_TENANT_ID || 'zenithfall',
  }
};
export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  // Allow HMR and dev proxying from Codespaces and local loopback
  allowedDevOrigins: [
    '*.app.github.dev',
    '127.0.0.1',
    'localhost',
  ],
  experimental: {
    serverActions: {
      // Allow Server Actions from GitHub Codespaces and local dev
      allowedOrigins: [
        '*.app.github.dev',
        '*.vercel.app',
        'localhost:3000',
        '127.0.0.1:3000',
      ],
      // Raise limit for Excel/PDF file uploads (default is 1MB)
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;

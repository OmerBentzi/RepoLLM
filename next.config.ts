import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },

  // Configure dev indicators (only position is supported)
  devIndicators: {
    position: 'bottom-right',
  },
} as NextConfig;

export default nextConfig;

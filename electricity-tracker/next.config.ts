import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ['@electricity-tracker/shared'],
  
  webpack: (config) => {
    // Point to source files directly in development
    config.resolve.alias = {
      ...config.resolve.alias,
      '@electricity-tracker/shared': path.resolve(__dirname, '../packages/shared/src'),
    };
    return config;
  },
};

export default nextConfig;
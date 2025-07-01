import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

// Load env from one level up (e.g. `/live_wire/.env.local`)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const nextConfig: NextConfig = {
  // transpilePackages needed for webpack, but not for Turbopack
  transpilePackages: ['@electricity-tracker/shared']
};

export default nextConfig;

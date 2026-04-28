import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: ["100.107.63.82", "*.clawd.ai"],
};

export default nextConfig;

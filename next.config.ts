import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  // Evita che Turbopack risalga alla directory home cercando altri package-lock
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

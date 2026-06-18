import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "@prisma/client"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

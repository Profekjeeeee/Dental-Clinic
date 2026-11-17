import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async redirects() {
    return [
      { source: "/", destination: "/auth", permanent: false },
      { source: "/main", destination: "/screens/03_Main", permanent: false },
      { source: "/admin", destination: "/screens/admin/dashboard", permanent: false },
      { source: "/admin/feed", destination: "/screens/admin/feed", permanent: false },
      { source: "/admin/doctors", destination: "/screens/admin/doctors", permanent: false },
      { source: "/admin/price", destination: "/screens/admin/price", permanent: false },
      { source: "/admin/logs", destination: "/screens/admin/logs", permanent: false },
    ];
  },
};

export default nextConfig;

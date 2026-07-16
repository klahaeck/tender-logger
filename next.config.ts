import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "query",
            key: "date",
            value: "(?<date>\\d{4}-\\d{2}-\\d{2})",
          },
        ],
        destination: "/app?date=:date",
        permanent: true,
      },
      { source: "/timeline", destination: "/app/timeline", permanent: true },
      { source: "/appointments", destination: "/app/appointments", permanent: true },
      { source: "/incidents", destination: "/app/incidents", permanent: true },
      { source: "/reports", destination: "/app/reports", permanent: true },
      { source: "/settings", destination: "/app/settings", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);

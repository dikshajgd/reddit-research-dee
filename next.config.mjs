/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  outputFileTracingIncludes: {
    "/api/runs/**": ["./lib/prompts/**/*"],
  },
};

export default nextConfig;

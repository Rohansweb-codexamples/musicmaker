import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["3000-" + (process.env.BASE44_PUBLIC_HOST_SUFFIX ?? "")],
};

export default nextConfig;

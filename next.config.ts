import type { NextConfig } from "next";

// GitHub Pages serves this repo at /<repo-name>/, so the built site needs a
// static export plus a matching basePath/assetPrefix. The Base44 preview runs
// `next dev`, which must keep serving from "/", so the Pages config only
// applies outside preview mode.
const isPreview = process.env.BASE44_PREVIEW_MODE === "1";
const repoName = "musicmaker";

const nextConfig: NextConfig = isPreview
  ? {
      allowedDevOrigins: ["3000-" + (process.env.BASE44_PUBLIC_HOST_SUFFIX ?? "")],
    }
  : {
      output: "export",
      basePath: `/${repoName}`,
      assetPrefix: `/${repoName}/`,
      images: { unoptimized: true },
      trailingSlash: true,
    };

export default nextConfig;

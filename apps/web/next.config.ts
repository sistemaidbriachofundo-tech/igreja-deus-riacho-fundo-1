import type { NextConfig } from "next";

/**
 * GitHub Pages: site em /igreja-deus-riacho-fundo-1/
 * Override com NEXT_PUBLIC_BASE_PATH="" para preview local na raiz.
 */
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ?? "/igreja-deus-riacho-fundo-1";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@idbrf/shared"],
  images: {
    unoptimized: true,
  },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;

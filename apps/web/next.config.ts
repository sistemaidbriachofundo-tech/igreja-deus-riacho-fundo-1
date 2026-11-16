import type { NextConfig } from "next";

/**
 * GitHub Pages: site em /igreja-deus-riacho-fundo-1/
 * Apex/produção Hostinger: IDBRF_STATIC_APEX=1 (PowerShell apaga env vazia).
 * Override com NEXT_PUBLIC_BASE_PATH="" / Vercel na raiz.
 */
const basePath =
  process.env.IDBRF_STATIC_APEX === "1"
    ? ""
    : (process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.VERCEL === "1" ? "" : "/igreja-deus-riacho-fundo-1"));

const nextConfig: NextConfig = {
  output: "export",
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  trailingSlash: true,
  transpilePackages: ["@idbrf/shared"],
  images: {
    unoptimized: true,
  },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;

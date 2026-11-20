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

const devBranches = new Set(["feat/rf1-revisao-18-11", "chatgpt/rf1-pacote-front-dev-20261120"]);
const isRiachoDevPreview = process.env.VERCEL_ENV === "preview" &&
  devBranches.has(process.env.VERCEL_GIT_COMMIT_REF ?? "");

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    ...(isRiachoDevPreview && {
      NEXT_PUBLIC_API_URL: "https://id-riacho1-api-qa.vercel.app",
      NEXT_PUBLIC_HML_ENABLED: "true",
      NEXT_PUBLIC_MEMBERSHIP_MAP_DEMO: "1",
      NEXT_PUBLIC_YOUTUBE_LIVE_TEST: "1",
    }),
  },
  trailingSlash: true,
  transpilePackages: ["@idbrf/shared"],
  images: {
    unoptimized: true,
  },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;

import { defineConfig } from "vitest/config";

export default defineConfig({
  // O Next usa JSX automático; manter o mesmo runtime nos testes de componentes.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // O vitest não resolve o specifier "cloudflare:workers" (o tsc resolve
      // via @cloudflare/workers-types). Stub mínimo em tests/stubs/.
      "cloudflare:workers": "./tests/stubs/cloudflare-workers.ts",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // O motor quant e os contratos carregam o risco: número errado sai publicado como fato.
      // Ver CLAUDE.md §3.
      include: ["src/quant/**", "src/schemas/**", "src/committee/**"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});

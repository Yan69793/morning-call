import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // CLAUDE.md §3: nenhum número publicado sem origem rastreável. `any` apaga a fronteira
      // entre dado validado e dado cru, que é justamente o que os schemas existem para marcar.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // No entry do Worker, `console.log` É o mecanismo de observabilidade: é o que sai no
    // `wrangler tail`. Tratar como desleixo aqui empurraria o log para `console.warn`, que
    // sinalizaria problema onde há operação normal. Mesma lógica para scripts de linha de
    // comando, onde stdout é a interface com quem rodou.
    files: ["apps/morning-call/src/index.ts", "apps/morning-call/scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    ignores: [
      "dist/",
      ".wrangler/",
      "node_modules/",
      "coverage/",
      "eslint.config.js",
      // O Radar Quant é produto próprio e traz o seu próprio tooling (o frontend tem
      // `eslint.config.js`, e o worker roda `tsc --noEmit` como análise estática, por decisão
      // registrada no CLAUDE.md dele). Impor as regras daqui sobre código que chegou pronto e em
      // produção geraria dezenas de erros que não são bug, só divergência de convenção — e a
      // reorganização de pastas não é a hora de reabrir a convenção de outro projeto.
      // Reavaliar quando os dois apps convergirem de propósito, não como efeito colateral.
      "apps/radar-quant/",
    ],
  },
);

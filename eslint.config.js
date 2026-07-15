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
  // O próprio config fica fora: não é código de runtime e não está no tsconfig do Worker, então
  // as regras type-checked não têm tipo para trabalhar em cima dele.
  { ignores: ["dist/", ".wrangler/", "node_modules/", "coverage/", "eslint.config.js"] },
);

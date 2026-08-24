import js from "@eslint/js";
import globals from "globals";
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
      // Prefixo `_` marca parametro aceito de proposito e nao usado, caso comum em
      // assinatura de handler (o `ctx` do Worker) e em porta de funcao que mantem a
      // forma do original. Sem isto a saida ou fica poluida ou empurra alguem a apagar
      // parametro que faz parte do contrato.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
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
    // comando, onde stdout é a interface com quem rodou. `workflow.ts` e `orchestrator/run.ts`
    // são o próprio pipeline durável (steps do Workflow) e logam os mesmos eventos estruturados
    // de execução normal, não debug esquecido — mesma razão do entry point.
    // 24/08/2026: `src/data/agenda/**` entrou pela mesma razao. Os coletores emitem
    // JSON estruturado com campo `event` (`agenda_fetch_done`, `agenda_fallback`,
    // `agenda_scrape_*_ok`), que e o rastro de execucao normal no `wrangler tail`.
    // Os quatro eventos de falha do mesmo diretorio (`*_fail`, `*_error`) foram
    // promovidos a `console.warn` na mesma data, porque estavam saindo no nivel de
    // informacao e degradacao de scraper sumia no meio do log de operacao normal.
    files: [
      "apps/morning-call/src/index.ts",
      "apps/morning-call/src/workflow.ts",
      "apps/morning-call/src/orchestrator/run.ts",
      "apps/morning-call/src/data/agenda/**",
      "apps/morning-call/scripts/**",
    ],
    rules: { "no-console": "off" },
  },
  {
    // LINTREMOTE1 (2026-08-24): `briefing-interno/remote/` produzia 19 erros de
    // `Parsing error: was not found by the project service`, um por arquivo, desde que
    // nasceu em 19/08. A causa e o `projectService: true` la em cima: ele exige um
    // tsconfig cobrindo cada arquivo, e o remote nao tem nenhum. O efeito pratico nao
    // era "reprovou", era "nunca foi lido" — 12 fontes e 7 testes do Worker de reserva,
    // que e quem envia o briefing com o PC desligado, sem analise estatica nenhuma.
    //
    // Nao entra no `ignores` porque `remote/` e fonte, nao bundle gerado como o resto
    // daquela lista. E nao ganha tsconfig porque e JavaScript ESM de verdade
    // (`"type": "module"`, sem build), nao TypeScript: criar um projeto TS so para o
    // linter inventaria uma fronteira de tipo que o codigo nunca teve.
    //
    // A saida e desligar so as regras que precisam de tipo e manter as sintaticas, que
    // sao as que pegam bug de verdade em JS (variavel nao usada, identificador
    // inexistente, caso duplicado em switch, codigo inalcancavel).
    files: ["briefing-interno/remote/**/*.{js,mjs}"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      // `disableTypeChecked` traz `languageOptions.parserOptions` zerando o
      // `projectService`, que e exatamente o que resolve o parsing error aqui.
      // Espalhar antes e preciso, senao o objeto inteiro seria substituido.
      ...tseslint.configs.disableTypeChecked.languageOptions,
      // `src/` roda em workerd e `tests/` em `node --test`. Declarar os dois evita
      // no-undef em `fetch`, `Response`, `crypto`, `process` e afins.
      globals: { ...globals.serviceworker, ...globals.node },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      // Log estruturado e a observabilidade do Worker, sai no `wrangler tail`.
      // Mesma decisao ja tomada para o entry do morning-call mais acima.
      "no-console": "off",
    },
  },
  {
    ignores: [
      // `**/` é obrigatório num monorepo: o padrão `.wrangler/` só casa a raiz, e os artefatos
      // que o `wrangler dev` gera ficam em `apps/*/.wrangler/tmp/`. Sem isto o lint quebra com
      // "not found by the project service" em bundle gerado — erro que não é código de ninguém,
      // e que só aparece depois que alguém roda o dev server.
      "**/dist/",
      // `apps/morning-call/wrangler.toml` define `[assets] directory = "dist-assets"`, não "dist".
      // Padrão diferente do resto do monorepo, então precisa da própria entrada aqui — sem isto o
      // eslint tenta tipar o bundle do Vite como se fosse código-fonte nosso.
      "**/dist-assets/",
      "**/.wrangler/",
      // Worktree de tarefa em segundo plano (Agent isolation: "worktree"): checkout separado,
      // sempre em `<raiz>/.claude/worktrees/<nome>/`, nunca aninhado — por isso sem `**/` na
      // frente. Sem isto, `eslint .` também varre o snapshot de outra sessão, que pode estar num
      // commit anterior ao daqui e reportar erro que já foi corrigido do lado de cá.
      ".claude/worktrees/",
      "**/node_modules/",
      "**/coverage/",
      "eslint.config.js",
      // O Radar Quant é produto próprio e traz o seu próprio tooling (o frontend tem
      // `eslint.config.js`, e o worker roda `tsc --noEmit` como análise estática, por decisão
      // registrada no CLAUDE.md dele). Impor as regras daqui sobre código que chegou pronto e em
      // produção geraria dezenas de erros que não são bug, só divergência de convenção — e a
      // reorganização de pastas não é a hora de reabrir a convenção de outro projeto.
      // Reavaliar quando os dois apps convergirem de propósito, não como efeito colateral.
      "radar-quant-brasil/",
    ],
  },
);

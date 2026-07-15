# Radar Quant Brasil - Diretrizes e Contexto de Desenvolvimento

## 1. Diretrizes Globais de Engenharia (Canônico)
*   **Qualidade sobre Velocidade:** É terminantemente proibido ignorar a cobertura de testes para acelerar a entrega de uma funcionalidade. Código sem teste é débito técnico imediato.
*   **Comunicação Direta:** Toda e qualquer alteração estrutural na assinatura de APIs públicas deve ser documentada de forma clara.
*   **Gerenciamento de Erros:** Exceções devem ser capturadas na camada de infraestrutura e tratadas de modo a nunca expor detalhes internos do servidor (*stack traces*) para o cliente final.
*   **Segurança e Autenticação:** Mecanismos de controle de acesso (como fluxos SSO ou validação de tokens JWT) devem seguir estritamente as especificações centrais da arquitetura corporativa.

---

## 2. Pilha Tecnológica e Comandos Locais (Especificidade do Repositório)
*   **Ambiente de Execução:** Cloudflare Workers (Hono) + Node.js (scripts via tsx)
*   **Linguagem:** TypeScript Strict
*   **Comando de Validação (Testes):** `npm test -w @sz/radar-quant-worker` (da raiz do monorepo)
*   **Comando de Análise Estática (Linter):** `tsc --noEmit` (typecheck — não há linter dedicado configurado)

> **Este projeto agora vive num monorepo** (`ARCHITECTURE.md` AD-8 na raiz). Mudou o seguinte:
> - `dashboard/worker` → `apps/radar-quant/worker`; `dashboard/frontend` → `apps/radar-quant/frontend`.
> - `dashboard/shared` → **`packages/analytics`** (`@sz/analytics`), compartilhado com o Morning Call.
> - `scripts/type-sync.ps1` **foi removido**: existia para conferir se `shared/types.ts`,
>   `worker/src/types.ts` e `frontend/src/types/index.ts` continuavam iguais, e só sabia detectar a
>   divergência depois que ela acontecia. Hoje há um tipo só, em `@sz/analytics`, e os outros dois
>   arquivos são re-export. Não há o que sincronizar.
> - O lint e o Prettier da raiz **não** alcançam este app: ele mantém a convenção própria.
>
> **Validar após mudança** (da raiz): `npm test` e `npm run typecheck`. Para o ensaio de deploy:
> `npx wrangler deploy --dry-run --config ./wrangler.toml` de dentro de `worker/` — o `--config` é
> obrigatório no Windows, senão o wrangler procura o entry-point um nível acima e falha. Isso não é
> efeito do monorepo: acontece igual na árvore antiga.

---

## 3. Instruções de Fluxo para o Agente (Tool Calling)
*   Antes de reportar uma tarefa como concluída, execute o Comando de Validação local e certifique-se de que nenhum teste existente foi quebrado (Regressão).
*   Se o resultado de um teste falhar, analise o log de erro, aplique a correção de forma isolada e execute o teste novamente antes de interagir com o usuário.
*   Não altere a formatação de arquivos adjacentes que não estejam diretamente relacionados ao escopo da tarefa atual.

---

## 4. Regras de Raciocínio (Deep Thinking)
*   Antes de apresentar qualquer solução ou alteração de código, você deve abrir um bloco de pensamento e responder explicitamente:
    1. Qual é o problema real subjacente e quais as restrições de infraestrutura (Cloudflare Workers)?
    2. Quais são as 3 abordagens possíveis para resolver isso e os trade-offs de performance/manutenibilidade de cada uma?
    3. Por que a abordagem escolhida é tecnicamente superior às outras duas?
*   É terminantemente proibido omitir esta fase de análise e pular direto para o código.

---

## 5. Gestão de Erros no Tool Calling
*   Se o comando de testes (`vitest run`) falhar após uma alteração sua, não tente corrigir o código imediatamente com base no primeiro palpite.
*   Pare, leia o stack trace completo do erro, investigue os arquivos adjacentes que compartilham a mesma tipagem e formule uma hipótese lógica antes de executar a próxima ferramenta de escrita (`edit_file`).

# ARCHITECTURE.md — Decisões de Arquitetura

Registro das decisões estruturais, o porquê de cada uma e as alternativas rejeitadas. Não
reabrir sem evidência nova (preferência do projeto: só revisar posição diante de novas evidências).

---

## AD-8 — Monorepo: Morning Call e Radar Quant Brasil, sobre um núcleo compartilhado

**Decisão (2026-07-15):** este repositório deixa de ser "o Morning Call" e passa a hospedar dois
apps com deploys independentes (`apps/morning-call`, `apps/radar-quant`) sobre um pacote comum
(`packages/analytics`). O Radar Quant Brasil **continua sendo produto próprio**, com seu D1
(`radar-quant`), seu KV, seu Worker e seu dashboard. Não foi absorvido nem congelado.

**Por quê:** os dois calculavam a mesma coisa de formas diferentes. O Morning Call precisava de
retorno multi-janela, flag de qualidade de série e feed de preços; o Radar Quant já tinha os três,
em produção e testados. Duplicar seria repetir o erro que este repositório documenta em toda parte.

**O que o núcleo trouxe de volta**, e que o Morning Call não tinha: `Quality` com `staleLastBar` e
`partialSession` (o `as_of` da PC-1 operacionalizado), `computeMetrics` devolvendo `null` em vez de
`0` quando falta barra, e `weightedAvailable` renormalizando peso ausente em vez de tratá-lo como
zero. É a disciplina do AD-3 já implementada por outro projeto da casa.

**O que a mudança consertou no Radar Quant**, de graça:

- `shared/types.ts` era **triplicado** (`worker/src/types.ts`, `frontend/src/types/index.ts`) e
  sincronizado à mão por `scripts/type-sync.ps1`, um script que só sabia detectar a divergência
  depois de acontecer e mandar `cp`. Um workspace troca a conferência pela impossibilidade.
- `Regime` era declarado idêntico em `types.ts` e `signal-rules.ts`.
- `shared/` **nunca era typecheckado**: o `tsconfig.json` do worker incluía só `src/**`. Ao virar
  pacote com tsconfig próprio, apareceram 4 erros de tipo reais que existiam sem ninguém ver,
  incluindo `isRankable` lendo `item.quality || {}` — item sem qualidade apurada passava no gate
  que existe justamente para barrar, falhando para o lado errado.

**Rejeitado:**

- _Absorver o Radar Quant._ Enterraria um produto que funciona dentro de um experimento que o
  Portão 1 pode matar. O que já entrega valor não deve ser refém do que ainda não provou nada.
- _Só copiar o `analytics.ts`._ Dois arquivos iguais divergem; é o mesmo defeito do
  `skill/morning-call/assets/trade_card.schema.json`, que nasceu divergente do AD-6 e segue assim.
- _Consumir o Radar Quant via HTTP._ Acoplaria o runtime de um ao uptime do outro para reusar
  função pura, que é o tipo de coisa que se resolve com import.

**Dívida registrada:** `packages/analytics` roda sem `noUncheckedIndexedAccess`, ao contrário do
Morning Call. São 8 acessos indexados prováveis-falsos-positivos; ligar a flag é mudança com seus
próprios testes, não efeito colateral de mover pasta. Ver comentário em
`packages/analytics/tsconfig.json`.

---

## AD-1 — Runtime: Cloudflare Workers (estender o VixRadar), não Python/Docker

**Decisão:** o sistema roda como Worker(s) em TypeScript, reutilizando a infra do VixRadar
(Workers/Pages/KV/D1/R2 + cascade OpenRouter).

**Por quê:**

- Você **já opera** essa stack. Erguer um mundo Python (FastAPI/Postgres/Redis/Docker/LangGraph)
  paralelo dobra a superfície de manutenção sem ganho proporcional para uma carga que roda 1x/dia.
- Modelos de ponta hoje jogam a favor do edge: **Kimi K2.6 roda no Cloudflare Workers AI**;
  **GLM-5.2** e **DeepSeek V4** saem baratíssimos via **OpenRouter** (mesma chave do VixRadar).
- Cron Trigger nativo cobre o agendamento 06:30 BRT.

**Rejeitado:** stack Python dedicada (mais controle quant, porém infra redundante); híbrido
(quant em Python + edge) — reservado para _se e quando_ o motor quant provar ser pesado demais
para TypeScript, o que é improvável para as métricas necessárias.

**Risco aceito:** ecossistema quant em TS é mais pobre que pandas/numpy. Mitigação: as métricas
do Morning Call são elementares (retorno, vol, z-score, drawdown, correlação, inclinação de
curva, breakeven) e implementáveis/testáveis em TS sem dor.

---

## AD-2 — Orquestração hierárquica, 2 rodadas, não swarm paralelo de 4 frontier

**Decisão:** supervisor-worker com fan-out para análise e fan-in para validação; máximo 2 rodadas;
comitê determinístico em código. Ver `docs/RUNTIME_AGENTS.md`.

**Por quê:** o padrão hierárquico sai mais barato que fan-out paralelo puro para a mesma
qualidade, e o fan-out com merge sofre de falso-consenso, agentes concordando com a maioria mesmo
quando ela está errada. Roteamento e cache recuperam a maior parte do ganho a uma fração do custo.

> **Números removidos por falta de fonte.** Este documento citava "F1 ~0.92 a ~1.4x custo",
> "~89% do ganho a ~1.15x" e "diminishing returns acima de ~US$1/pergunta" atribuídos a um
> "benchmark 2026" que ninguém consegue apontar. Num repositório cuja regra absoluta é que todo
> dado carrega origem (CLAUDE.md §3), citar benchmark sem fonte é exatamente o comportamento que
> o sistema existe para impedir. A decisão continua de pé pelo argumento qualitativo acima; para
> reintroduzir os números, cite o paper. Ver também AD-7.

**Rejeitado:** 4 modelos frontier debatendo livremente (custo alto, falso-consenso, latência).

---

## AD-3 — Dados são o gargalo; LLM nunca produz número

**Decisão:** camada de dados determinística com `source`+`timestamp` em cada observação; motor
quant em código; LLMs só interpretam. Dado sem fonte → `N/D — REQUER VERIFICAÇÃO`.

**Por quê:** o melhor agente financeiro medido acerta <50% das tarefas; a fragilidade vem de
dado ruim e imprecisão numérica, não de "pouca inteligência" do modelo. Ver `docs/DATA_SOURCES.md`.

---

## AD-4 — Modelos via OpenRouter + Workers AI

**Decisão:** OpenRouter como camada principal (1 chave: GPT-5.6, Gemini 3.1 Pro, Claude Opus
4.7, GLM-5.2, DeepSeek V4); Kimi K2.6 via Workers AI para tarefas agênticas baratas.

**Roteamento por criticidade:** estrategista/red team/editor → frontier; técnico/auditoria/
formatação → GLM-5.2 / DeepSeek / Kimi.

**Nome de modelo não pertence a este arquivo.** Modelo e preço envelhecem em semanas, e um
documento de arquitetura não é lugar de tabela de preço. O que fica aqui é a política (roteamento
por criticidade, fallback, sem provedor único); a lista concreta vive num registry em config,
versionado, com o preço checado contra a doc do provedor no dia. Ver a nota de custo abaixo.

---

## AD-5 — Runtime durável: Workflows, não handler `scheduled` monolítico

**Decisão:** o cron só cria a instância do Workflow. Cada etapa da pipeline (coleta, quant, cada
agente, comitê, relatório) é um `step.do()`.

**Por quê:** um handler `scheduled` faz a pipeline inteira num processo só, e um run tem 4+
chamadas LLM mais dezenas de fetches. Falha do provedor na etapa 7 perdia as 6 anteriores, e o
retry refazia tudo, duplicando teses. Isso contradizia diretamente a regra de idempotência do
CLAUDE.md §3, que era promessa sem mecanismo. Workflows dá retry por passo, persistência do
intermediário e retomada, sem nada de custom.

**Reforço em código:** `UNIQUE INDEX idx_runs_trade_date` em `migrations/0001_init.sql`. Um
pregão, um run: a idempotência vira invariante do banco, não disciplina do orquestrador.

**Rejeitado:** Durable Object com máquina de estado à mão (reconstrói o que Workflows já dá).

---

## AD-6 — `TradeCard` discrimina por forma de entrada, não por categoria

**Decisão:** `entrada` é união discriminada por `tipo`: `preco`, `spread` ou `premio`.
`categoria` (direcional, carry, hedge...) segue como classificação econômica, ortogonal.

**Por quê:** o `entrada: z.number()` original só modelava direcional a preço. Steepener entra em
bps de inclinação, call spread entra em prêmio, cesta long/short não tem preço único: metade das
categorias declaradas não cabia no contrato. Discriminar por `categoria` também não resolve, e é
o erro sutil: um hedge tanto pode ser montado a preço quanto por prêmio, e um carry pode ser spot
ou futuro. A forma de entrada e a natureza econômica são eixos independentes.

**Consequência:** `risco_retorno` deixou de ser campo declarado pelo LLM e virou função de
retorno e perda (`riscoRetorno()`), com unidade obrigatória em toda grandeza. Antes, o comitê
pontuava assimetria com um número que o modelo inventava e ninguém conferia contra os insumos.

---

## AD-7 — Comitê: gates em código, ranking por assimetria; pesos só depois de calibrados

**Decisão:** a aprovação é um conjunto de gates booleanos decidíveis em código (tem fonte, tem
invalidação objetiva, risco-retorno acima do mínimo, sem divergência numérica, aprovado pelo red
team, liquidez compatível). Entre os sobreviventes, ordena-se por assimetria ajustada por
correlação. Sem média ponderada.

**Por quê:** o scoring anterior (`0.25*qualidade_fontes + 0.15*forca_catalisador + ...`) se
apresentava como determinístico e sem LLM, mas `qualidade_fontes` e `forca_catalisador` só podem
sair de um LLM. Era um LLM com verniz de fórmula, e os pesos eram precisão falsa: nunca foram
calibrados contra resultado nenhum. Gate booleano é honesto sobre o que dá para decidir sem
opinião; ordenar por assimetria usa o único número que o quant realmente produz.

**Quando reabrir:** na Fase 7, com histórico suficiente em `trade_marks` para calibrar peso
contra acerto observado. Peso calibrado é evidência; peso chutado é decoração.

---

## Fluxo de dados (alto nível)

```
Cron 06:30 BRT → Worker (só dispara) → Workflow, um step.do() por etapa
  → [step] calendário: é pregão? (B3/NYSE) — se não, aborta cedo
  → [step] data/ (BCB SGS, Focus, PTAX, B3, ANBIMA, Tesouro, FRED, U.S. Treasury, CME)
  → KV (cache) + D1 (snapshot datado, antes de qualquer LLM)
  → [step] quant/ (métricas determinísticas) → D1
  → [step] agents/ (fan-out via OpenRouter/Workers AI)
  → [step] committee/ (gates + ranking, em código)
  → [step] report/ (FinalEditor monta o Morning Call)
  → R2 (relatório) + D1 (teses/trades p/ avaliação) + entrega

Cron 18:30 BRT → marcação a mercado dos trades abertos → D1 (trade_marks: MAE, MFE, status)
```

---

## Estimativa de custo (ordem de grandeza, calibrar em `docs/COST_ESTIMATE.md`)

> A tabela de preços por 1M tokens que estava aqui foi removida: preço de API muda sem aviso, e
> uma tabela desatualizada num doc de arquitetura é pior que nenhuma, porque ninguém a rechecagem.
> O lugar dela é `docs/COST_ESTIMATE.md`, com data de consulta e link para a página de preço de
> cada provedor, e o custo real medido vem da tabela `agent_calls` em D1, não de estimativa.

Um run/dia com roteamento (frontier só onde importa) deve ficar em **poucos dólares/dia**. O maior
custo real tende a ser **dados de qualidade institucional** (vol implícita, curva intraday,
spreads de crédito secundário, fluxo), não os tokens. Priorizar isso em `docs/DATA_SOURCES.md`.

---

## Pendências que ainda precisam de decisão

1. **Fontes de dados pagas vs. gratuitas** — o item de maior impacto. (Fase 2 / `DATA_SOURCES.md`.)
2. Formato de entrega final: e-mail, painel no VixRadar, PDF em R2, ou os três.
   Se for e-mail, note que MailChannels encerrou o tier gratuito para Workers: hoje a rota é
   Resend ou Postmark, com custo e chave próprios.
3. **Política de `as_of` por praça.** Às 06:30 BRT o snapshot mistura fechamento americano de
   ontem, Ásia de hoje e Europa em pré-abertura. Sem regra explícita, o quant compara 1D entre
   janelas diferentes e erra sem nenhum teste acusar. `Venue` e `WindowReturn.janela_as_of` já
   existem nos schemas para carregar a decisão; falta tomá-la e travar em teste. (Fase 2.)
4. Calendário de feriados (B3 + NYSE): o cron não conhece feriado, a checagem é do primeiro step.

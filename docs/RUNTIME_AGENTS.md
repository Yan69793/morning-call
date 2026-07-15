# RUNTIME_AGENTS.md — Arquitetura de Agentes (runtime)

> Este arquivo define os **agentes de runtime** que geram o Morning Call, não confundir com os
> agentes de código (esses seguem `CLAUDE.md`). Aqui está a árvore, os papéis, os modelos por
> função, os contratos de entrada/saída e as regras que impedem alucinação e falso-consenso.
>
> Ficava em `AGENTS.md` na raiz, mas esse nome virou convenção de instrução de build: agentes de
> código abriam este arquivo achando que era a constituição do repositório. `AGENTS.md` agora é
> só um ponteiro para `CLAUDE.md`.

---

## 0. PRINCÍPIO DE DESENHO

Orquestração **hierárquica (supervisor-worker)**, não um swarm paralelo de 4 modelos frontier.
O padrão hierárquico entrega a mesma qualidade mais barato, e o fan-out paralelo com merge sofre
de **falso-consenso**: agentes concordam com a maioria mesmo quando ela está errada. Roteamento e
cache recuperam a maior parte do ganho a uma fração do custo.

> Os números que estavam aqui ("F1 ~0.92 a ~1.4x custo", "~89% do ganho a ~1.15x") foram
> removidos junto com os do `ARCHITECTURE.md` AD-2: eram atribuídos a um "benchmark 2026" sem
> fonte apontável. Este projeto barra número órfão no relatório; barrar também na própria
> documentação é o mínimo de coerência. Para reintroduzir, cite o paper.

Regras de ouro:

- **Máximo 2 rodadas de "debate".** Rodada 1: pesquisa + propostas. Rodada 2: crítica + correção.
  Depois, consolidação. Mais rodadas elevam custo e latência sem melhorar acurácia.
- **Números vêm do motor quant, não dos LLMs.** LLMs recebem números já calculados e os interpretam.
- **Todo agente devolve JSON validado** contra `src/schemas`. Falha de schema = falha da etapa.
- **Anti-ancoragem:** o red team recebe as operações propostas, mas **não** o raciocínio completo
  do estrategista, para não herdar os mesmos vieses.

---

## 1. ÁRVORE DE EXECUÇÃO

Cada `[n]` é um `step.do()` de um Cloudflare Workflow, não um trecho de um handler monolítico:
falha na etapa 5 não perde as quatro anteriores, e o retry retoma em vez de repetir
(`ARCHITECTURE.md` AD-5).

```
Cron 06:30 BRT → dispara o Workflow (o Worker não faz mais nada)
      ↓
[0] É pregão? (calendário B3 + NYSE)                  ── sem LLM, aborta cedo se não
      ↓
[1] Coleta determinística de dados  (src/data)        ── sem LLM → D1 (snapshot datado)
      ↓
[2] Motor quantitativo              (src/quant)       ── sem LLM → D1
      ↓
[3] Fan-out — rodada 1
 ┌──────────────────────┬──────────────────────────────┐
 │ Research             │ Strategist                   │
 │ pesquisa + fontes    │ teses + fichas de trade      │
 └──────────────────────┴──────────────────────────────┘
      ↓
[4] Red Team — rodada 2                               ── modelo ≠ Strategist
    recebe as fichas, NÃO o raciocínio do estrategista (anti-ancoragem)
      ↓  (fan-in)
[5] Comitê: gates + ranking          (src/committee)  ── código, sem LLM
      ↓
[6] Editor final                                      ── monta o relatório
      ↓
Morning Call  →  R2 (relatório) + D1 (teses, trades aceitos E rejeitados) + entrega

Cron 18:30 BRT → marcação a mercado dos trades abertos → D1 (trade_marks: MAE, MFE, status)
```

O segundo cron não é detalhe operacional: sem ele o sistema publica opinião para sempre e nunca
descobre o próprio placar.

---

## 2. AGENTES E RESPONSABILIDADES

Cada agente: responsabilidade única, input tipado, output JSON validado, informa `sources` e
`uncertainties`, nunca altera o input, tem timeout e fallback.

| Agente                    | Papel                                                             | Modelo (default)                        | Entrada                                      | Saída (schema)     |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- | ------------------ |
| **ResearchAgent**         | Notícias, discursos, comunicados, geopolítica, consenso narrativo | Gemini 3.1 Pro (Deep Research)          | data snapshot + universo                     | `ResearchOutput`   |
| **MacroStrategistAgent**  | Regime, mapa causal, erros de precificação globais                | GPT-5.6 (Terra/Sol) ou Opus 4.7         | quant + research                             | `ThesisList`       |
| **BrazilStrategistAgent** | Fiscal, DI, câmbio, equities BR, crédito                          | GPT-5.6 ou Opus 4.7                     | quant + research (BR)                        | `ThesisList`       |
| **TechnicalAgent**        | Tendência, momentum, níveis (só sobre números do quant)           | GLM-5.2 / DeepSeek V4                   | quant                                        | `TechnicalRead`    |
| **CreditAgent**           | Spreads, risco de default, valor relativo em crédito              | GPT-5.6 ou Opus 4.7                     | quant + research                             | `CreditRead`       |
| **TradeConstructorAgent** | Converte teses em fichas de trade completas                       | GPT-5.6                                 | ThesisList                                   | `TradeCard[]`      |
| **RedTeamAgent**          | Destrói cada tese; aprova/rejeita/revisar                         | Claude Opus 4.7 (modelo ≠ estrategista) | TradeCard[] (sem raciocínio do estrategista) | `RedTeamVerdict[]` |
| **DataValidationAgent**   | Campos faltantes, consistência, prob. somam 100%, frases vagas    | Kimi K2.6 (Workers AI) / Qwen local     | rascunho consolidado                         | `ValidationReport` |
| **FinalEditorAgent**      | Monta o relatório final conforme `MORNING_CALL_OTIMIZADO.md`      | GPT-5.6 ou Opus 4.7                     | tudo validado                                | `MorningCall`      |

> **Roteamento de custo:** tarefas de baixa criticidade (técnico, auditoria, classificação,
> reformatação) vão para modelos baratos (GLM-5.2, DeepSeek, Kimi via Workers AI). Só
> estrategista/red team/editor usam modelos frontier.

### Escopo do v1: quatro agentes, não nove

A tabela acima é o destino, não o MVP. O v1 roda **Research, Strategist (macro e Brasil juntos),
RedTeam e FinalEditor**. Os cinco de fora, e por quê:

| Fora do v1                                                 | Motivo                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TechnicalAgent`                                           | Lê números que o quant já produziu. Custo e superfície de falha sem informação nova.                                                                    |
| `CreditAgent`                                              | Depende de spread de crédito secundário, que `docs/DATA_SOURCES.md` marca como pago ou indefinido. Agente sem dado por baixo só produz texto plausível. |
| `TradeConstructorAgent`                                    | Vira função do Strategist: separar tese de ficha só adiciona um hop e uma chance de perder contexto.                                                    |
| `DataValidationAgent`                                      | As sete checagens são decidíveis em código (`ValidationReport` em `src/committee`). LLM para validar schema é o pior custo-benefício do sistema.        |
| `MacroStrategistAgent` e `BrazilStrategistAgent` separados | Fundidos enquanto o mesmo modelo atende bem os dois. Separar quando houver evidência de que a especialização melhora o call.                            |

Reabrir cada um quando existir o dado que o justifique, não antes: o gargalo é dado, não agente
(CLAUDE.md §5).

---

## 3. CONTRATO DE SAÍDA (exemplos)

Todos os schemas vivem em `src/schemas` e **eles são a fonte da verdade**, não os exemplos abaixo.
Exemplo do ResearchAgent:

```json
{
  "facts": [
    {
      "claim": "Copom manteve a Selic em 15,00%",
      "source": {
        "name": "BCB",
        "tier": 1,
        "url": "https://...",
        "retrieved_at": "2026-07-15T09:30:12.000Z"
      },
      "happened_at": "2026-07-14T21:30:00.000Z"
    }
  ],
  "market_consensus": [],
  "possible_mispricings": [],
  "uncertainties": [],
  "data_gaps": ["N/D — REQUER VERIFICAÇÃO: ..."],
  "provenance": { "run_id": "...", "model": "...", "prompt_version": "...", "generated_at": "..." }
}
```

Três coisas mudaram em relação ao rascunho original deste arquivo (ver `ARCHITECTURE.md` AD-6):

- **Tempo é UTC estrito** (sufixo `Z`), não `timestamp_brt`. BRT só na renderização; guardar
  horário local é bug garantido em fronteira de dia e feriado.
- **Fonte é objeto, não string**, e carrega `tier` (a hierarquia do §18 vira dado, não parágrafo).
- **Todo artefato de LLM carrega `provenance`** (run_id, model, prompt_version). Sem isso a Fase 7
  não responde "qual modelo acerta mais", e não dá para retrofitar em histórico já gravado.

A ficha de trade (`TradeCard`) é o contrato crítico e obedece à Seção 11 do
`MORNING_CALL_OTIMIZADO.md`. A ausência de qualquer campo obrigatório invalida o trade, e um trade
que não valida não entra no relatório. Dois pontos que o schema impõe e nenhum prompt garantiria:

- **`entrada` é união discriminada por forma** (`preco` | `spread` | `premio`), porque steepener
  entra em bps de inclinação e call spread entra em prêmio. Toda grandeza carrega unidade, e
  alvos, faixa e invalidação precisam estar na mesma unidade da entrada: comparar 25 bps com 25%
  passa por qualquer checagem ingênua.
- **`risco_retorno` não é campo do agente.** É derivado de retorno e perda por `riscoRetorno()`.
  Um modelo que declarar a própria assimetria tem o número descartado no parse.

---

## 4. COMITÊ DE INVESTIMENTO (gates em código, sem LLM)

Ver `ARCHITECTURE.md` AD-7. Duas etapas, nesta ordem:

**Gates.** Booleanos, todos decidíveis sem opinião. Um trade só passa se cumprir todos:

- tem ao menos uma fonte, e as fontes existem no snapshot do run;
- tem invalidação objetiva (condição textual e, quando há preço, nível do lado certo da entrada);
- risco-retorno derivado acima do mínimo configurado;
- sem divergência numérica contra o quant;
- veredito `aprovar` do red team;
- liquidez compatível com o sizing;
- correlação com trades já aceitos abaixo do teto, ou justificativa explícita.

**Ranking.** Entre os sobreviventes, ordena por assimetria ajustada por correlação. Só isso.

> A fórmula ponderada que estava aqui (`0.25*qualidade_fontes + 0.15*forca_catalisador + ...`)
> foi removida. Ela se apresentava como determinística e sem LLM, mas `qualidade_fontes` e
> `forca_catalisador` só podem sair de um LLM: era um LLM com verniz de fórmula, e os pesos nunca
> foram calibrados contra resultado nenhum. Reabrir na Fase 7, com `trade_marks` cheia o bastante
> para calibrar peso contra acerto observado.

Trades rejeitados são **registrados** em D1 com o motivo (`trades.publicado = 0`,
`motivo_rejeicao`). Medir o que o comitê barrou é a única forma de descobrir, depois, se ele
estava barrando o certo.

---

## 5. GUARDRAILS ANTI-FALHA

- **Falso-consenso:** red team usa modelo distinto do estrategista e não vê o raciocínio dele;
  o comitê é determinístico (código), não votação de LLMs.
- **Alucinação numérica:** nenhum número publicado sem origem no motor quant ou em fonte datada;
  o `DataValidationAgent` + validador de código barram números órfãos.
- **Loop infinito:** limite rígido de 2 rodadas; timeout por agente; orçamento de tokens por run.
- **Fornecedor fora do ar:** fallback de modelo no OpenRouter; se a coleta de um dado falha, a
  seção sai como `N/D`, não inventada.
- **Custo:** log de tokens/custo por agente por run; alerta se ultrapassar teto configurado.

---

## 6. PROMPTS

Os prompts de cada agente ficam em `prompts/` (um arquivo por agente), **fatiados** por
responsabilidade a partir do `MORNING_CALL_OTIMIZADO.md`. Nunca envie o prompt editorial
inteiro para todos os agentes — cada um recebe só a sua seção mais as regras de rastreabilidade
(Seção 18) e de qualidade (Seção 19).

> Nota para agentes de código (Codex, Gemini CLI etc.): para **construir** este sistema, leia
> `CLAUDE.md`. Este arquivo descreve o comportamento de **runtime**, não o processo de build.

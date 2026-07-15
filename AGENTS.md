# AGENTS.md — Arquitetura de Agentes (runtime)

> Este arquivo define os **agentes de runtime** que geram o Morning Call — não confundir com os
> agentes de código (esses seguem `CLAUDE.md`). Aqui está a árvore, os papéis, os modelos por
> função, os contratos de entrada/saída e as regras que impedem alucinação e falso-consenso.

---

## 0. PRINCÍPIO DE DESENHO

Orquestração **hierárquica (supervisor-worker)**, não um swarm paralelo de 4 modelos frontier.
Justificativa (benchmark 2026 de arquiteturas multi-agente em finanças): o padrão hierárquico
fica na fronteira de Pareto de custo-acurácia (F1 ~0.92 a ~1.4x custo), enquanto o fan-out
paralelo com merge é mais caro e sofre de **falso-consenso** — agentes concordam com a maioria
mesmo quando errada. Roteamento + cache recuperam ~89% do ganho a ~1.15x do custo base.

Regras de ouro:
- **Máximo 2 rodadas de "debate".** Rodada 1: pesquisa + propostas. Rodada 2: crítica + correção.
  Depois, consolidação. Mais rodadas elevam custo e latência sem melhorar acurácia.
- **Números vêm do motor quant, não dos LLMs.** LLMs recebem números já calculados e os interpretam.
- **Todo agente devolve JSON validado** contra `src/schemas`. Falha de schema = falha da etapa.
- **Anti-ancoragem:** o red team recebe as operações propostas, mas **não** o raciocínio completo
  do estrategista, para não herdar os mesmos vieses.

---

## 1. ÁRVORE DE EXECUÇÃO

```
Cron 06:30 BRT
      ↓
[1] Coleta determinística de dados  (src/data)        ── sem LLM
      ↓
[2] Motor quantitativo              (src/quant)       ── sem LLM
      ↓
[3] Distribuição paralela (fan-out) — workers de análise
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ Research     │ Estrategista │ Red Team     │ Auditor      │
 │ (Gemini 3.1) │ (GPT-5.6 /   │ (Claude 4.7) │ (Kimi/Qwen)  │
 │ pesquisa+    │  Opus 4.7)   │ crítica      │ validação    │
 │ fontes       │ teses+trades │ adversarial  │ barata       │
 └──────────────┴──────────────┴──────────────┴──────────────┘
      ↓  (fan-in)
[4] Validador numérico e de fontes  (src/committee)   ── código, sem LLM
      ↓
[5] Comitê de investimento (scoring determinístico)   ── código
      ↓
[6] Editor final / orquestrador (GPT-5.6 ou Opus 4.7) ── monta o relatório
      ↓
Morning Call + trades + alertas  →  D1 (histórico) + R2 (relatório) + entrega
```

---

## 2. AGENTES E RESPONSABILIDADES

Cada agente: responsabilidade única, input tipado, output JSON validado, informa `sources` e
`uncertainties`, nunca altera o input, tem timeout e fallback.

| Agente | Papel | Modelo (default) | Entrada | Saída (schema) |
|---|---|---|---|---|
| **ResearchAgent** | Notícias, discursos, comunicados, geopolítica, consenso narrativo | Gemini 3.1 Pro (Deep Research) | data snapshot + universo | `ResearchOutput` |
| **MacroStrategistAgent** | Regime, mapa causal, erros de precificação globais | GPT-5.6 (Terra/Sol) ou Opus 4.7 | quant + research | `ThesisList` |
| **BrazilStrategistAgent** | Fiscal, DI, câmbio, equities BR, crédito | GPT-5.6 ou Opus 4.7 | quant + research (BR) | `ThesisList` |
| **TechnicalAgent** | Tendência, momentum, níveis (só sobre números do quant) | GLM-5.2 / DeepSeek V4 | quant | `TechnicalRead` |
| **CreditAgent** | Spreads, risco de default, valor relativo em crédito | GPT-5.6 ou Opus 4.7 | quant + research | `CreditRead` |
| **TradeConstructorAgent** | Converte teses em fichas de trade completas | GPT-5.6 | ThesisList | `TradeCard[]` |
| **RedTeamAgent** | Destrói cada tese; aprova/rejeita/revisar | Claude Opus 4.7 (modelo ≠ estrategista) | TradeCard[] (sem raciocínio do estrategista) | `RedTeamVerdict[]` |
| **DataValidationAgent** | Campos faltantes, consistência, prob. somam 100%, frases vagas | Kimi K2.6 (Workers AI) / Qwen local | rascunho consolidado | `ValidationReport` |
| **FinalEditorAgent** | Monta o relatório final conforme `MORNING_CALL_OTIMIZADO.md` | GPT-5.6 ou Opus 4.7 | tudo validado | `MorningCall` |

> **Roteamento de custo:** tarefas de baixa criticidade (técnico, auditoria, classificação,
> reformatação) vão para modelos baratos (GLM-5.2, DeepSeek, Kimi via Workers AI). Só
> estrategista/red team/editor usam modelos frontier.

---

## 3. CONTRATO DE SAÍDA (exemplos)

Todos os schemas vivem em `src/schemas`. Exemplo do ResearchAgent:

```json
{
  "facts": [{ "claim": "", "source": "", "url": "", "timestamp_brt": "" }],
  "market_consensus": [],
  "possible_mispricings": [],
  "uncertainties": [],
  "data_gaps": ["N/D — REQUER VERIFICAÇÃO: ..."]
}
```

A ficha de trade (`TradeCard`) é o contrato crítico e obedece à Seção 11 do
`MORNING_CALL_OTIMIZADO.md`. Campos **obrigatórios** (a ausência de qualquer um invalida o trade):
nome, classe, instrumento, direção, entrada, faixa de entrada, horizonte, tese, erro de
precificação, catalisador, por que agora, por que não-consensual, retorno potencial, perda máxima,
risco-retorno, invalidação/stop, alvo 1, alvo 2, sizing (% do orçamento de risco), correlação com
outras, riscos ocultos, plano de saída, estrutura alternativa/hedge, convicção 0–10, categoria.

---

## 4. COMITÊ DE INVESTIMENTO (scoring determinístico, sem LLM)

Uma função em `src/committee` pontua cada trade. Peso sugerido (calibrar depois):

```
score = 0.25*qualidade_fontes
      + 0.20*assimetria
      + 0.15*forca_catalisador
      + 0.15*robustez_no_red_team
      + 0.10*liquidez
      + 0.10*independencia_vs_outras_posicoes
      + 0.05*(1 - custo_implementacao)
```

Um trade **só passa** se: fontes verificadas, risco-retorno mínimo definido, invalidação
objetiva, sem divergência numérica, aprovado pelo red team, liquidez compatível. Trades
rejeitados são **registrados** (para medir, ao longo do tempo, quais modelos/teses acertaram).

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

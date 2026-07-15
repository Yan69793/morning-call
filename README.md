# Morning Call

Sistema de inteligência de mercado que gera diariamente um Morning Call multimercados
(Brasil + global) para gestores profissionais, UHNW e family offices.

Roda como Cloudflare Worker (TypeScript), estendendo a infraestrutura do VixRadar. Coleta dados
reais e datados, calcula métricas **em código**, e usa uma orquestração hierárquica de LLMs
(via OpenRouter + Workers AI) para transformar cenário macro em **operações executáveis,
condicionais, rastreáveis e disciplinadas por risco**.

> Este sistema gera teses auditáveis. **Não executa ordens nem move dinheiro.**

## Documentos

| Arquivo | O que é |
|---|---|
| `CLAUDE.md` | Instruções globais / constituição para agentes de código |
| `AGENTS.md` | Arquitetura de agentes de runtime (a árvore) |
| `ARCHITECTURE.md` | Decisões de arquitetura e o porquê |
| `IMPLEMENTATION_PLAN.md` | Fases de implementação |
| `MORNING_CALL_OTIMIZADO.md` | Contrato editorial do relatório (fonte da verdade) |
| `docs/DATA_SOURCES.md` | Matriz de fontes de dados (o gargalo real) |

## Princípio

O gargalo não são os modelos — são os dados. LLMs interpretam números; nunca os inventam.

## Início rápido (após Fase 0)

```bash
npm install
npm run dev      # wrangler dev
npm test
```

Deploy (`npx wrangler deploy`) é sempre uma ação humana explícita.

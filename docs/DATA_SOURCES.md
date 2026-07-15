# DATA_SOURCES.md — Matriz de Fontes (o gargalo real)

> Este é o documento de maior alavancagem do projeto. Preencher na Fase 2, de preferência com
> pesquisa do Gemini CLI. Cada dado precisa de fonte primária, alternativa, custo e licença.
> Regra: dado sem fonte confiável → `N/D — REQUER VERIFICAÇÃO`, nunca inventado.

## Matriz (preencher)

| Dado                         | Fonte primária             | Alternativa      | Frequência | Atraso     | Custo       | Licença   | Confiabilidade |
| ---------------------------- | -------------------------- | ---------------- | ---------- | ---------- | ----------- | --------- | -------------- |
| Selic / DI                   | BCB SGS                    | B3               | diária     | —          | grátis      | pública   | alta           |
| Focus                        | BCB (Expectativas)         | —                | semanal    | —          | grátis      | pública   | alta           |
| PTAX / USD/BRL               | BCB PTAX                   | provedor mercado | diária     | fim de dia | grátis      | pública   | alta           |
| Ibovespa / ações             | B3                         | provedor mercado | intraday   | 15min*     | varia       | verificar | média          |
| Curva DI intraday            | B3/ANBIMA                  | provedor         | intraday   | varia      | pago?       | verificar | verificar      |
| Tesouro / NTN-B              | Tesouro Direto / ANBIMA    | —                | diária     | —          | grátis      | pública   | alta           |
| Treasuries US                | U.S. Treasury / FRED       | —                | diária     | —          | grátis      | pública   | alta           |
| S&P/Nasdaq/VIX               | provedor mercado           | —                | intraday   | varia      | varia       | verificar | verificar      |
| Commodities (Brent/WTI/ouro) | CME / provedor             | —                | intraday   | varia      | varia       | verificar | verificar      |
| Vol implícita                | provedor derivativos       | —                | intraday   | varia      | **pago**    | verificar | verificar      |
| Spreads crédito secundário   | ANBIMA / provedor          | —                | diária     | varia      | **pago?**   | verificar | verificar      |
| Fluxo estrangeiro            | B3                         | —                | D+1/D+2    | atraso     | grátis/pago | verificar | média          |
| Notícias                     | Reuters/Bloomberg/FT/Valor | Perplexity       | contínua   | —          | pago        | verificar | alta           |

\* Confirmar delays reais e termos de uso de cada fonte antes de depender dela.

## Itens que provavelmente NÃO existem de graça com qualidade institucional

Vol implícita completa, curva intraday, spreads de crédito secundário, opções completas, fluxo
estrangeiro em tempo real, consenso em tempo real. Decidir por cada um: pagar, aproximar com
proxy datado, ou marcar `N/D` no relatório. **Não fabricar.**

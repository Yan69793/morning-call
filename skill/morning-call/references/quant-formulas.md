# Motor Quantitativo — fórmulas e armadilhas

Todo número do relatório vem daqui (código testado), **nunca** de LLM. Implementação de
referência: `scripts/quant.py` (pura, testada). Em produção o mesmo vive em `src/quant` (TS).

## Convenções

- Preços em ordem cronológica crescente. Séries com `as_of` datado.
- BR: base **252** dias úteis. US: base 252 (juros) / 365 quando aplicável. Ser explícito.
- Retornos: usar **log-retornos** para agregação temporal; **simples** para P&L do período.
- bps: 1% = 100 bps. Não misturar % com bps.

## Fórmulas

- **Retorno simples**: `r = P_t / P_{t-1} - 1`. Período: `P_fim/P_ini - 1`.
- **Log-retorno**: `ln(P_t / P_{t-1})`. Soma de logs = retorno composto do intervalo.
- **Vol realizada (anualizada)**: `std(logrets) * sqrt(252)` (BR/juros). Informar a janela.
- **Drawdown**: pico-a-vale = `min(P_t / cummax(P) - 1)`.
- **Momentum**: retorno acumulado numa janela (ex.: 21d, 63d, 252d), excluindo (ou não) o último dia.
- **Correlação**: Pearson sobre log-retornos alinhados por data (dropar buracos, não preencher).
- **Z-score**: `(x - média_janela) / desvio_janela`. Diz quão extremo é o movimento vs. história.
- **Inclinação de curva**: `slope = y_longo - y_curto` (ex.: DI jan/31 − jan/27), em bps.
- **Curvatura (butterfly)**: `2*y_meio - y_curto - y_longo`.
- **Inflação implícita (breakeven)**: `(1+pré)/(1+real) - 1` (pré vs. NTN-B de prazo equivalente).
- **Risco-retorno**: `|alvo - entrada| / |entrada - invalidação|`. É a assimetria da ficha de trade.
- **Stress**: reprecificar posição sob choque (ex.: +100bps DI, +10% USD) e somar o P&L.

## Armadilhas (checar sempre)

- **Look-ahead bias**: não usar dado que só existiria depois do horário do sinal.
- **Survivorship bias**: universo de ações deve incluir deslistadas no histórico.
- **Feriados/calendário**: B3 e US divergem; alinhar por data, não por índice posicional.
- **Fuso**: normalizar tudo para BRT no relatório; guardar o timezone da fonte.
- **Contratos DI expirados**: usar só vértices líquidos vigentes.
- **Unidades**: Selic série 11 é **% ao dia**; meta Selic (432) é **% a.a.**. Não confundir.
- **Dado observado vs. estimado**: nunca misturar; marcar estimativas.

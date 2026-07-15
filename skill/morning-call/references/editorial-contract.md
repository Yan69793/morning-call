# Contrato Editorial — as 19 seções (condensado)

Fonte da verdade no repositório: `MORNING_CALL_OTIMIZADO.md`. Aqui vai o resumo operacional para
o FinalEditor e para checagem. Horários em **BRT**. Nada de frase vaga ("monitorar", "cautela",
"pode haver volatilidade") — substituir por condição mensurável.

## As seções

1. **Abertura executiva** (≤5 linhas): tensão macro; regime; viés; convicção 0–10; premissa que
   sustenta os preços e o fato que a quebra.
2. **Painel global multiativos**: cotação; var D/5D/mês/ano/12m; tendência; momentum; vol;
   suporte/resistência; driver; precificado vs. não precificado. Avaliar breadth/concentração.
3. **Leitura do último ano**: por regime; separar retorno por fundamento/múltiplo/liquidez/squeeze/geopolítica.
4. **Mapa causal**: cadeia dominante + alternativas + efeitos de 2ª/3ª ordem.
5. **Brasil**: fiscal, dívida, primário, inflação/expectativas, atividade, BCB, fluxo; vs. pares EM.
6. **Curva DI**: vértices líquidos; nível/Δbps/inclinação/curvatura; real e implícita; vs. Focus/Copom;
   estruturas (steepener/flattener/butterfly/RV) e por que superam a direcional.
7. **Câmbio**: USD/BRL vs. DXY/carry/vol/fiscal; estrutura à vista/futuro/opções ou não operar.
8. **Equities BR**: setores; beta macro vs. defensivo; pares/cestas; ações só com fundamento+liquidez+catalisador.
9. **Crédito privado**: spreads por rating/duration; onde não remunera; vs. soberano/CDS/ações do emissor.
10. **Radar internacional**: EUA/Europa/China/Japão/geopolítica; efeitos 1ª/2ª/3ª ordem.
11. **Motor de Oportunidades**: 3–7 trades (ficha completa) ou "NÃO OPERAR É A MELHOR OPERAÇÃO".
12. **Ranking**: tabela; #1 = melhor oportunidade (não maior retorno); penalizar consenso/carry ruim/gap.
13. **Cenários**: Base/Bull/Bear/Cisne cinza; prob. somam 100%; gatilhos, vencedores, hedge, confirmação/invalidação.
14. **Teste contrário**: consenso, onde erra, qual dado muda a visão; ≥1 visão contraintuitiva defensável.
15. **Gestão de risco**: orçamento, exposições, sensibilidades, stress (+50bps UST, +100bps DI, +10% oil/USD, −10% Ibov, −15% Nasdaq).
16. **Agenda e gatilhos**: hora BRT | evento | consenso | anterior | sensibilidade | trade condicional.
17. **Plano do pregão**: comprar/vender/manter/proteger/evitar; blocos ANTES/DURANTE/FECHAMENTO.
18. **Rastreabilidade**: FATOS / INTERPRETAÇÕES / HIPÓTESES / DADOS INCOMPLETOS; fonte+hora; `N/D — REQUER VERIFICAÇÃO`.
19. **Padrão de qualidade**: responde o quê/porquê/precificado/onde erra/qual trade/como/quando/quanto/o que invalida/hedge.

## Ficha de trade (Seção 11) — todos obrigatórios

nome · classe · instrumento · direção · entrada · faixa de entrada · horizonte · tese · erro de
precificação · catalisador · por que agora · por que não-consensual · retorno potencial · perda
máxima · risco-retorno · invalidação/stop · alvo 1 · alvo 2 · sizing (% do **orçamento de risco**)
· correlação com outras · riscos ocultos · plano de saída · estrutura alternativa/hedge · convicção
0–10 · categoria (direcional/valor relativo/carry/convexidade/hedge/arbitragem de narrativa/evento/
assimetria de cauda). Schema executável: `assets/trade_card.schema.json`.

## Checagens automáticas antes de publicar

- Todo trade tem entrada, alvo e invalidação. · Probabilidades dos cenários somam 100%.
- Toda afirmação factual tem fonte+hora, ou está em DADOS INCOMPLETOS. · Sem números conflitantes.
- Sem trades duplicados/altamente correlacionados sem justificativa. · Disclaimer no rodapé.

## Disclaimer (rodapé, obrigatório)

> Este material apresenta cenários e estruturas para análise profissional. A execução depende de
> suitability, mandato, liquidez, custos, tributação e limites individuais de risco.

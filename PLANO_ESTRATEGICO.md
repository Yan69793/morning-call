# Morning Call — Plano Estratégico Definitivo (v2, por portões)

> **O que é.** O artefato consolidado da fase [BRAINSTORM]: escopo, riscos, portões com kill
> pré-registrado. Funde o plano de sequenciamento (v0) e o plano por portões (v1), incorpora os
> três contra-ataques do Veredito, e adiciona duas coisas que nenhum dos dois tinha com precisão
> (significância estatística e look-ahead por cutoff). **O que não é.** O plano de execução
> granular do `writing-plans.md`. Esse só se escreve depois que P1 travar. Escrevê-lo antes é
> inventar precisão que o projeto ainda não ganhou.
>
> **Restrição governante.** Zero alucinação. Uso pessoal remove cliente, assinatura e regulador
> da equação; o único valor que sobra é que todo número seja real e rastreável e que o sistema
> nunca invente um dado. Todo portão serve a isso.

---

## 0. Objetivo
Um relatório de mercado diário, para uso próprio, cujos números você use sem reconferir, e cujas
teses você raciocine sabendo o que é fato coletado e o que é inferência de modelo.

---

## 1. Parâmetros a travar (só você decide — não invento)

| Parâmetro | Opções | Proposta (confirmar) |
|---|---|---|
| **P1. Natureza** | (a) Máquina de calls. (b) Brief situacional. | **TRAVADO: (a) máquina de calls** (usuário, 15/07/2026). Consequência: o kill é sobre **alfa** (não utilidade); o `TradeCardDraft` completo se justifica (não é peso morto); o teste tem de ser **forward/pós-cutoff**. |
| **P2. Barra de sucesso / kill** | O critério que te faria abandonar. | Proposta de dois estágios em §6 (smoke test + prova de borda por MinTRL). Ajustar N. |
| **P3. Classes cobertas** | Quais mercados. | **TRAVADO** (15/07): juros BR (NTN-B, DI, Focus, Copom), câmbio, crédito privado/debêntures, macro+geopolítica, cripto/metais, e **renda variável (ações)**. |

**Por que P1 é a bifurcação real.** [CERTO] ela decide o que o Portão 1 mede e o que é
over-engineering. Se (a), o Portão 1 é experimento de borda com kill sobre alfa. Se (b), mede
confiança e cobertura, e o kill é sobre utilidade e devaneio. Você já commitou um `TradeCardDraft`
de ~24 campos: se P1=(b), metade disso pode ser peso morto — e descobrir isso agora é melhor que
depois.

---

## 2. Portões (kill escrito ANTES de entrar)

### Portão 0 — Escopo regulatório · RESOLVIDO
[CERTO] uso pessoal, sem distribuir recomendação sobre ativo nomeado, fica fora do Art. 2 da
Resolução CVM 20. Você tem CNPI, então mesmo a hipótese te encontra credenciado como pessoa
natural. **Resíduo:** [CERTO] distribuir por CNPJ um dia reabre isto (Ofício APIMEC 004/2025 exige
credenciamento da PJ) — vira conversa com advogado antes do código de entrega, não depois.

### Pré-condições (antes do experimento, não são fase)
- **PC-1. Política de `as_of` por praça.** [CERTO] às 06:30 BRT o snapshot mistura fechamento US
  de ontem, Ásia de hoje e Europa em pré-abertura. **Estado: quase resolvido no schema** — `Venue`
  e `WindowReturn.janela_as_of` já carregam a decisão. Falta o quant *usar* isso e um teste que
  falhe se um retorno 1D cruzar praças sem marcar. Encerrar aqui, não no Portão 1.
- **PC-2. Encerrar a ficção da linguagem.** [CERTO] hoje `quant.py` (no `skill/`) é o único quant e
  `src/quant/` está vazio, contra o AD-1. **Ver a tensão de runtime no Portão 1**: a decisão pode
  não ser sua, é física (Worker não roda Python). Resolver junto do Portão 1, não antes.

### Portão 1 — O experimento que pode matar o projeto
Roda o **modelo único mais forte**, closed-book sobre um snapshot curado, gerando o output por um
período. Sem fan-out, sem comitê multi-agente. A infra já acertada (snapshot em D1 antes do LLM,
gates, provenance, discriminated unions) é o **instrumento de medida**, não um fim.

**[NOVO — look-ahead por cutoff de treino].** [CERTO] um LLM closed-book avaliado em datas
*dentro* da sua janela de treino já conhece o desfecho; há literatura de 2025 dedicada a detectar
esse viés em previsões de LLM. Consequência dura: **backtest histórico da tese de um LLM é
contaminado.** O único teste limpo é **forward** (paper-trade daqui para frente) ou, se histórico,
estritamente **pós-cutoff** do modelo. Isto empurra o desenho para forward, e reforça P1=(b).

**Se P1 = (a) máquina de calls.**
- Baselines na mesma janela: buy-and-hold do ativo, o null (não fazer nada), e o consenso
  (Focus/sell-side). O consenso é o que testa diretamente a alegação de "não-consensual".
- **[NOVO — significância].** [CERTO] a pergunta "quantos trades provam borda?" tem resposta na
  literatura: **Minimum Track Record Length** e **Deflated Sharpe Ratio** (Bailey & López de
  Prado, 2014) dão o nº de observações para um Sharpe ser significativo, *corrigido por
  multiple-testing* — e cada ideia que você testa por dia é um trial que infla falso-positivo.
  Tradução honesta: 20–30 pregões é **teste de fumaça** ("obviamente quebrado ou perdendo"), nunca
  prova de borda. Prova exige janela grande, ou frequência de trade alta, ou você aceitar decidir
  sob incerteza e dizer isso em voz alta.
- **Kill pré-registrado (default, ajuste em P2):** se após N trades marcados pós-cutoff o modelo
  único não superar buy-and-hold ajustado a risco **e** o null, o build multi-agente não está
  autorizado. Escrever N e a definição de "superar" antes de começar.

**Se P1 = (b) brief situacional.**
- Métrica primária **não é alfa** — é **cobertura + tempo economizado + qualidade de inferência**.
  Duas a quatro semanas de brief diário: quantas vezes cobriu o que importava, quantas te
  economizou tempo contra ler as fontes na mão, quantas inferências se sustentaram.
- **[CORREÇÃO do Veredito, adotada].** Taxa de alucinação **não** é estatística a observar: se os
  mecanismos 3 e 4 da §4 funcionam, número errado é **rejeitado no parse, em código**. A taxa é
  **zero por construção**, e qualquer ocorrência é um **bug com stack trace**, com barra em zero
  absoluto, **fora** do experimento. Medir devaneio como fenômeno emergente é tratar como incerto
  algo que você decidiu tornar impossível.
- **Kill pré-registrado (default, ajuste em P2):** se o brief não te economiza tempo contra ler as
  fontes, ou não cobre o que importa, o formato atual não se justifica.

### Portão 2 — Camada de dados (downstream do Portão 1)
[PROVÁVEL] o projeto chama dados de "o gargalo" e acerta no diagnóstico, mas erra na ordem. O
experimento roda no **dado público gratuito** (BCB, Tesouro, FRED, US Treasury — já verificados).
Se borda/utilidade aparecem no público, ótimo e barato. Se não aparecem, isso te diz onde está o
valor (dado pago: vol implícita, curva intraday, spread secundário, fluxo) e **por quê** — aí você
compra com tese. Comprar antes do Portão 1 é a otimização prematura que o próprio CLAUDE.md §5
manda recusar. Absorver o `data-sources.md` verificado do `skill/` como fonte de verdade de
`docs/DATA_SOURCES.md`.

### Portão 3 — Complexidade só onde a evidência sustenta
Só se entra se o Portão 1 passou. Ônus da prova em **adicionar**, não em tirar. Cada adição é
medida contra o modelo único.
- [PROVÁVEL] a adição certa é o **RedTeam como filtro que rejeita trade fraco** — é como filtro,
  não como debatedor, que o multi-agente se paga em finanças. A literatura de LLM em mercados
  reforça: modelos tendem a superfície correlacional, não estrutura causal; um filtro adversarial
  ataca justamente isso.
- [CERTO] para o ganho de agregação, **amostrar o mesmo modelo forte N vezes e agregar
  (self-consistency)** é mais barato que orquestrar personas distintas e captura a maior parte do
  benefício — e evita o falso-consenso do fan-out paralelo.
- Auditor, TechnicalAgent e FinalEditor como chamada frontier seguem **sem justificativa** até prova.

---

## 3. Do estado atual do repo
**Manter sem discussão** (está certo e é raro): Workflows no lugar do handler monolítico (AD-5);
snapshot datado em D1 antes de qualquer LLM; gates booleanos sobre scoring ponderado (AD-7); união
discriminada por `status`/`tipo` (AD-6); `Provenance` em todo artefato de LLM; `Quantity` forçando
unidade; `Venue`/`janela_as_of` fechando `as_of`; `TradeCardDraft` derivando `risco_retorno` em
código e recusando unidades trocadas; migration que **grava trade reprovado com motivo** e
`trade_marks` com MAE/MFE. Este é o instrumento de medida do Portão 1, não um fim em si.

**Encerrar:** PC-1 (quant usar `janela_as_of` + teste que falhe cruzando praça) e PC-2 (junto do
Portão 1).

**Corrigir (lacuna real, ver §4):** o cross-check numérico **não existe** — `Fact` é
`{claim, source, happened_at}`, prosa sem `snapshot_key` nem `valor_citado`. Sem isso os mecanismos
3 e 4 são aspiração. Esta é a única peça de código que vale construir **antes** do Portão 1, porque
serve às duas naturezas de P1.

---

## 4. Arquitetura anti-alucinação (o coração — vale para (a) e (b))
Mecanismos determinísticos, nenhum depende de LLM se comportar:
1. **Snapshot-first.** Camada de dados busca todo número e grava em D1 **antes** de qualquer LLM. ✅ schema pronto.
2. **Closed-book.** Prompt contém só o snapshot. Sistema proíbe introduzir número ausente do snapshot.
3. **Parse exige proveniência.** Toda afirmação quantitativa referencia uma **chave do snapshot**. Sem isso, rejeita no parse, em código. ⛔ falta o schema `QuantClaim`.
4. **Cross-check numérico.** Todo número declarado é comparado ao valor real gravado; divergência rejeita. Pega "Selic 15,00" transcrita como "1,50". ⛔ falta o validador.
5. **Disciplina de N/D.** Dado faltando vira `N/D — REQUER VERIFICAÇÃO`. ✅ `DataPoint` união discriminada.
6. **Fato separado de inferência.** Relatório separa estruturalmente fato coletado de inferência. ✅ `Traceability`.

**[Contribuição concreta do Veredito, adotada]** Para 3 e 4 existirem, a afirmação quantitativa
precisa ser **estrutura, não prosa**:
```
QuantClaim = { snapshot_key: string, valor_citado: Quantity, contexto?: string }
```
Aí o cross-check é comparação trivial contra o snapshot em D1: chave inexistente rejeita, unidade
diferente rejeita, valor fora da tolerância rejeita. Sem essa mudança de contrato, "zero
alucinação" é promessa, não mecanismo.

---

## 5. O que muda vs. os dois planos anteriores
- **Do v0 (sequenciamento):** sobrevivem os schemas, D1 e a infra. Cai a ordem "dados como próxima
  fase" — dado caro é downstream do Portão 1.
- **Do v1 (portões):** adotado quase inteiro. Corrigido: o kill de P1=(b) não mede taxa de
  alucinação (é zero por construção); e PC-2 pode se resolver por física, não doutrina.
- **Novo (pesquisa desta rodada):** (i) significância via MinTRL/Deflated Sharpe + penalidade de
  multiple-testing; (ii) look-ahead por cutoff → Portão 1 forward/pós-cutoff; (iii) a mudança de
  schema `QuantClaim` que torna o cross-check implementável.

---

## 6. Decisões a travar agora → próximo passo
**Travado (15/07/2026):** P1 = (a) máquina de calls. P3 = juros BR, câmbio, crédito/debêntures,
macro+geopolítica, cripto/metais, renda variável. Cross-check da §4 implementado e testado
(`src/committee/crossCheck.ts` + `QuantClaim`, 10 testes verdes).

**Pendente:**
1. **Runtime do Portão 1** — script 1x/dia (SQLite) vs. Worker desde já. [PROVÁVEL] script chega ao
   kill antes e o `quant.py` já serve; o experimento não deveria pagar o imposto da arquitetura
   final. É a última trava antes do plano de execução.
2. **P2 — kill pré-registrado de (a), dois estágios.** (i) *Smoke test*, ~20-30 pregões: se o modelo
   único estiver obviamente perdendo para buy-and-hold **e** para o null, mata cedo. (ii) *Prova de
   borda*, N ≫ 30 (MinTRL, corrigido por multiple-testing): só então "bater o consenso" significa
   algo. Ajustar N e a definição de "bater".

Com o runtime travado, escrevo o plano de execução granular (`writing-plans.md`), tarefa a tarefa,
para o ramo (a). O teste do Portão 1 roda **forward** (paper-trade daqui para frente), não em
histórico dentro da janela de treino do modelo.

<!--
  FONTE DE VERDADE das fontes de dados. Absorvido de skill/morning-call/references/data-sources.md
  em 2026-07-15: o material do skill era substancialmente melhor que o que havia aqui (endpoints
  testados ao vivo, códigos SGS, o limite de 10 anos por chamada do BCB, séries do FRED), enquanto
  este arquivo era uma matriz com "verificar" em quase toda célula. O documento de maior alavancagem
  do projeto estava no lugar que ninguém tinha declarado como canônico.

  O skill agora aponta para cá em vez de copiar. Duas cópias de uma matriz de endpoints divergem
  do mesmo jeito que dois schemas divergem.
-->

# Fontes de Dados — endpoints verificados

Índice: [Regras](#regras) · [BCB](#bcb) · [Tesouro](#tesouro) · [ANBIMA](#anbima) · [B3](#b3) ·
[FRED](#fred) · [US Treasury](#us-treasury) · [Mercado/FX/cripto](#mercado) · [Matriz](#matriz) ·
[Unidade e tolerância](#tolerancia)

Endpoints marcados ✅ foram testados ao vivo (jul/2026). Sempre gravar `source`+`timestamp`+
`as_of` junto do dado. Sem fonte confiável → `N/D — REQUER VERIFICAÇÃO`.

<a name="regras"></a>

## Regras de uso

- Chaves em `.dev.vars` / `wrangler secret`. Nunca no código nem em log.
- Respeitar rate limits; cachear em KV (dados diários: TTL até o próximo fechamento).
- Códigos de série do SGS abaixo são os usuais, mas **confirmar no catálogo** antes de confiar:
  https://dadosabertos.bcb.gov.br (Portal de Dados Abertos) / SGS.

<a name="bcb"></a>

## BCB — Banco Central (grátis, sem chave, público)

### SGS (Sistema Gerenciador de Séries Temporais) ✅

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CODIGO}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CODIGO}/dados/ultimos/{N}?formato=json
```

- Desde 26/03/2025: **filtros obrigatórios** (limite de volume). Consulta por período limitada a
  **10 anos** por chamada (senão erro). Datas em `dd/MM/aaaa`.
- `ultimos/{N}` tem teto de **20 valores**. Acima disso devolve HTTP 400 com
  `A quantidade máxima de valores deve ser 20`. Medido em 24/08/2026, `ultimos/20` passa e
  `ultimos/25` falha.
- **Séries de meta são publicadas para frente.** A `432` (meta Selic) é diária e vai até a
  vigência da próxima reunião do Copom. Em 24/08/2026 os 20 últimos valores iam de 28/08 a
  16/09, todos futuros. Para saber a taxa em vigor hoje, usar consulta por período com
  `dataFinal` amarrada em hoje, nunca `ultimos/N`.
- Resposta: `[{"data":"14/07/2026","valor":"0.052531"}]`.
- Testado ✅: `.../bcdata.sgs.11/dados/ultimos/1?formato=json` → Selic diária.

Códigos SGS usuais (confirmar): `1` USD/BRL PTAX venda diária · `11` Selic diária (% a.d.) ·
`12` CDI diária · `432` Meta Selic Copom (% a.a.) · `1178` Selic anualizada (base 252) ·
`433` IPCA mensal · `13522` IPCA acum. 12m · `189` IGP-M · `4390` Selic acum. mês ·
`21619`/`1` câmbio. **Verifique cada código no catálogo antes de usar em produção.**

### PTAX (câmbio oficial) — Olinda

```
https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-dd-aaaa'&$format=json
```

Cotação de fechamento oficial (compra/venda) para conversões contratuais.

### Focus / Expectativas de Mercado — Olinda OData ✅ (público)

```
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/{RECURSO}?$format=json&$top=100&$filter=...
```

Recursos: `ExpectativasMercadoAnuais`, `ExpectativaMercadoMensais`, `ExpectativasMercadoTop5Anuais`,
`ExpectativasMercadoInflacao12Meses`, `ExpectativasMercadoSelic`. Filtrar por `Indicador`
(ex.: 'IPCA', 'PIB Total', 'Câmbio', 'Selic') e `Data`. Swagger:
`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/swagger-ui3`.
Use para a divergência tese vs. Focus (Seções 5, 6, 16 do contrato editorial).

<a name="tesouro"></a>

## Tesouro Nacional (grátis, sem identificação)

### Tesouro Transparente — preços e taxas do Tesouro Direto (CSV diário)

```
https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto
```

CSV histórico de preços/taxas (LTN, NTN-B, NTN-F...). Base para juro real (NTN-B) e inflação
implícita. "Não há necessidade de identificação nem remuneração" — respeitar orientações de uso.

### APIs do Tesouro Nacional (índice oficial)

```
https://www.gov.br/tesouronacional/pt-br/central-de-conteudo/apis
```

Inclui Siconfi (dados fiscais de entes) e custos. Para dívida pública/primário.

<a name="anbima"></a>

## ANBIMA (curvas, IMA, debêntures — **requer credenciais/registro**)

```
https://api.anbima.com.br/feed/precos-indices/v1/debentures/mercado-secundario   (GET)
```

- Debêntures (secundário): bid/ask/taxas indicativas e PU. Curvas de crédito extraídas das
  debêntures precificadas. IMA (carteira teórica): 1º dia útil e dia 15.
- Portal dev: `https://developers.anbima.com.br` · Dados: `https://data.anbima.com.br`.
- **Auth necessária** (client_id/secret ANBIMA). Custo/licença: verificar contrato. Isto cobre
  parte do gargalo de crédito privado (Seção 9). Sem acesso → marcar `N/D`.

<a name="b3"></a>

## B3 (índices, DI, market data)

```
https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/b3-for-developers/
https://www.b3.com.br/.../up2data/dados-disponiveis/
```

- **B3 for Developers** (APIs) e **UP2DATA** (arquivos, inclui debêntures da metodologia de
  precificação). Cotação em tempo real é **paga/licenciada**; há dados com atraso (delay) e
  arquivos EOD. Curva DI intraday tende a ser paga → decidir pagar, usar proxy datado, ou `N/D`.
- Tesouro Direto também exposto via B3 (`developers.b3.com.br/apis/tesouro-direto`).

<a name="fred"></a>

## FRED — St. Louis Fed (grátis, **requer API key** gratuita) ✅

```
https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json
```

- `file_type=json` (default é xml). `units`: `lin|chg|ch1|pch|pc1|pca|cch|cca|log`. Agregação de
  frequência disponível. Chave: `https://fred.stlouisfed.org/docs/api/api_key.html`.
- Testado ✅ (sem key retorna 400 pedindo `api_key`). Séries úteis: `DGS2` `DGS10` `DGS30`
  (Treasuries CMT), `DFF` (Fed Funds), `CPIAUCSL` (CPI), `T10YIE` (breakeven 10a), `VIXCLS`,
  `DTWEXBGS` (dólar amplo), `DCOILBRENTEU` (Brent), `DCOILWTICO` (WTI), `GOLDAMGBD228NLBM`.

<a name="us-treasury"></a>

## U.S. Treasury (grátis, sem chave)

### Par Yield Curve (CMT) — XML feed oficial ✅

```
https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={AAAA}
```

Testado ✅ (retorna feed XML). Vencimentos: 1,1.5,2,3,4,6 meses e 1,2,3,5,7,10,20,30 anos.

### Fiscal Data API (JSON) ✅

```
https://api.fiscaldata.treasury.gov/services/api/fiscal_service/{ENDPOINT}?page[size]=...&filter=...
```

Testado ✅ (`.../v1/accounting/od/rates_of_exchange`). Docs:
`https://fiscaldata.treasury.gov/api-documentation/`. Para dívida/câmbio de referência do governo.

<a name="mercado"></a>

## Mercado / FX / commodities / cripto (índices, ações, cripto)

### Yahoo Finance v8 chart ✅ (em produção, não oficial)

```
https://query1.finance.yahoo.com/v8/finance/chart/{SIMBOLO}?interval=1d&range=1mo
```

Sem chave, sem cookie, sem crumb, só `User-Agent`. Testado ao vivo 24/08/2026, HTTP 200 nos
14 símbolos. **É o que o briefing usa hoje**, em `briefing-interno/scripts/_comum.py`
(`YAHOO_SYMBOLS`) e `coletar_precos.py`. Cobre `^BVSP`, `BRL=X`, `^GSPC`, `^VIX`, `DX-Y.NYB`,
`GC=F`, `CL=F`, `BTC-USD` e as ações `.SA`.

Este arquivo dizia até 24/08/2026 que o Yahoo tinha descontinuado a API e que não se devia
depender dele. A afirmação estava em conflito com o código em produção, que depende. Registrado
como está de fato, com o risco explícito: endpoint não contratual, pode sair do ar sem aviso, e
por isso o dólar tem PTAX como fonte primária e o Yahoo só como segunda opinião.

**Armadilha das barras.** A resposta traz barras que não são pregão encerrado. Medido em
24/08/2026 (segunda): `^BVSP` vinha com uma barra sintética de sexta 22:59 cujo `timestamp` é o
próprio `regularMarketTime`, duplicando a data do fechamento oficial com valor diferente
(170.448,875 contra 171.032,0); `BRL=X` trazia barra do dia corrente às 07:42; `CL=F` já tinha
barra diária de 24/08 incompleta. Pegar a última barra erra nos três. A regra usada em
`_barras_diarias` é descartar data >= hoje, descartar `ts == regularMarketTime`, e deduplicar por
data ficando com a primeira ocorrência.

### Alternativas com chave

Opções com free tier (confirmar limites/licença antes de produção):

- **Alpha Vantage** (`alphavantage.co`) — ações/FX/commodities/cripto + indicadores; free tier baixo.
- **Finnhub** (`finnhub.io`) — realtime ações/FX/cripto; ~60 req/min no free.
- **Twelve Data** (`twelvedata.com`) — ações/FX/cripto/commodities.
- **FMP** (`financialmodelingprep.com`) — quotes ações/ETF/índices/FX/cripto/commodities.
- Cripto direto nas exchanges (Binance/Coinbase) para BTC/ETH sem intermediário.

> Muitos itens do painel (S&P/Nasdaq/VIX intraday, commodities intraday) exigem provedor pago
> para qualidade institucional. Definir por item: pagar, proxy datado (ex.: FRED EOD) ou `N/D`.

<a name="matriz"></a>

## Matriz resumo

| Dado                                                | Fonte primária                   | Chave?           | Custo          | Verificado   |
| --------------------------------------------------- | -------------------------------- | ---------------- | -------------- | ------------ |
| Selic/CDI/IPCA/PTAX diário                          | BCB SGS                          | não              | grátis         | ✅           |
| Câmbio oficial fechamento                           | BCB PTAX (Olinda)                | não              | grátis         | —            |
| Focus (expectativas)                                | BCB Expectativas (Olinda)        | não              | grátis         | ✅(endpoint) |
| Tesouro Direto preços/taxas                         | Tesouro Transparente CSV         | não              | grátis         | —            |
| Debêntures/curvas crédito/IMA                       | ANBIMA API                       | **sim**          | contrato       | —            |
| Índices/DI/EOD BR                                   | B3 (Developers/UP2DATA)          | parcial          | parte pago     | —            |
| Treasuries/CPI/breakeven/Brent                      | FRED                             | **sim (grátis)** | grátis         | ✅           |
| Par yield curve US                                  | US Treasury XML                  | não              | grátis         | ✅           |
| Ações/FX/commodities/cripto                         | Alpha Vantage/Finnhub/Twelve/FMP | sim              | free tier→pago | —            |
| Índices/ações/commodities/cripto EOD (**em uso**)   | Yahoo Finance v8 chart           | não              | grátis         | ✅           |
| Vol implícita / fluxo / spreads secundário intraday | provedor pago                    | sim              | **pago**       | —            |

A linha "Índices/DI/EOD BR → B3" acima descreve o destino, não o que roda. O fechamento de
Ibovespa que entra no briefing vem do Yahoo, não da B3.

<a name="tolerancia"></a>

## Unidade e tolerância de comparação

Definido em 24/08/2026 junto com a REGRA 6 do `validar_briefing.py`, que confronta cada nível de
mercado citado no briefing com a cotação real. Não havia convenção anterior neste projeto.

Tolerância única não serve. Um por cento sobre 5,16 são cinco centavos, um por cento sobre
170.000 são 1.700 pontos. O mesmo número é erro grosseiro num ativo e ruído no outro.

| Classe | Unidade | Tolerância | Ativos |
| --- | --- | --- | --- |
| índice | % | 0,5 | IBOV, SPX |
| câmbio | % | 1,0 | USDBRL, DXY |
| ação | % | 0,5 | PETR4, VALE3, ITUB4, BBDC4, ABEV3, WEGE3 |
| commodity | % | 0,5 | GOLD, WTI |
| volatilidade | % | 2,0 | VIX |
| cripto | % | 1,5 | BTC |
| juro | ponto-base | 5 | SELIC |

Juro se compara em ponto-base porque 0,25 p.p. é uma decisão de Copom inteira, não
arredondamento. Retorno e nível de preço se comparam em percentual.

A tolerância de 1% no câmbio não é folga arbitrária. PTAX é fixing das 13h e o Yahoo `BRL=X` é
spot de 24h, então divergem de forma legítima. Medido em 21/08/2026: PTAX 5,1625 contra Yahoo
5,1931, diferença de 0,593%.

Valores canônicos em `briefing-interno/scripts/_comum.py`, `ATIVOS_META`. Esta tabela é a
explicação, o código é a fonte.

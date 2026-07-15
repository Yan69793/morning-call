# DATA_SOURCES.md — Matriz de Fontes (Portão 1)

> Absorvido de `skill/morning-call/references/data-sources.md` + matriz do Portão 1.
> Dado sem fonte → `N/D — REQUER VERIFICAÇÃO`. Chaves em `.dev.vars` / secrets.

## Implementado em código (`src/data`)

| Dado | Provider | Key secret | Custo | Notas |
|---|---|---|---|---|
| USD/BRL, Selic, CDI, IPCA 12m | `bcb/sgs.ts` | não | grátis | SGS códigos em `keys.ts` |
| Focus IPCA/Selic/Câmbio | `bcb/focus.ts` | não | grátis | baseline consenso |
| UST 2/10/30, VIX, DXY proxy, Brent, WTI | `fred.ts` | `FRED_API_KEY` | grátis | sem key → ND |
| UST 2/10/30 | `ustreasury.ts` | não | grátis | XML; merge prefere OK |

## Endpoints (verificados no skill, jul/2026)

### BCB SGS
```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CODIGO}/dados/ultimos/{N}?formato=json
```
Códigos: `1` USD/BRL · `11` Selic diária · `12` CDI · `432` Meta Selic · `13522` IPCA 12m.

### Focus Olinda
```
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$format=json&$top=50&$orderby=Data%20desc
```

### FRED
```
https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json
```
Séries: DGS2, DGS10, DGS30, VIXCLS, DTWEXBGS, DCOILBRENTEU, DCOILWTICO.

### U.S. Treasury XML
```
https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={AAAA}
```

## Não no Portão 1 (pago / licença)

Vol implícita, curva DI intraday, spreads secundários ANBIMA, fluxo B3 realtime, notícias Reuters/BBG.
Decisão: pagar só se Portão 1 provar valor no público ou provar que o gap é o gargalo.

## Política as_of

- Venue em todo DataPoint (`BR` | `US` | `EU` | `ASIA` | `GLOBAL_24H`)
- Retorno 1D cruzando venues sem `allowCrossVenue` → erro em `quant/metrics.ts`

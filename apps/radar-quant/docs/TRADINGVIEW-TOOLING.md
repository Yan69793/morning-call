# TradingView tooling — fonte unica

## Canonico de produto

- App / Worker: `Morning Call\apps\radar-quant`
- Scan diario: Task Scheduler `RadarQuant-ScanDiario` (pwsh via WindowsApps path)
- Wrangler prod: `apps\radar-quant\worker\wrangler.toml` (name `radar-quant-brasil`)

## Bridge MCP (CDP local)

- Repo/bridge: `C:\Users\User\Documents\tradingview-mcp`
- Uso: agentes (Grok MCP `tradingview`, Claude) leem/controlam TradingView Desktop via CDP
- Nao redeployar Workers a partir de `Operacoes-Recorrentes\Trading View\**` — wranglers legados desabilitados em 2026-07-27

## Legado (bloqueado)

- `Operacoes-Recorrentes\Trading View\dashboard\worker\wrangler.toml.DISABLED-LEGADO`
- `Operacoes-Recorrentes\Trading View\Dashboard Monitoramento Mercado Financeiro\wrangler.toml.DISABLED-LEGADO`
- Mesmos D1/KV de producao; deploy daqui sobrescreveria prod.

## Dados de mercado alternativos

- Skill `global-stock-analysis` (Alpha Vantage / marketdata-cli) instalada em
  `Morning Call\.claude\skills\global-stock-analysis` e skills globais.
- Requer `ALPHAVANTAGE_API_KEY` no ambiente do operador.

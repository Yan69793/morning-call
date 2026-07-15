# Radar Quant Brasil

Dashboard institucional de monitoramento de mercado financeiro. Radar macro em tempo real, otimizador de estratégias ORB/VWAP, modo operador ao vivo e histórico de scans com comparação de regimes.

## Arquitetura

```
Scripts locais de ingestão (PowerShell / Python)
        │
        │  POST /api/ingest/*
        │  Header: x-ingest-secret
        ▼
┌─────────────────────────────┐
│   Cloudflare Worker (Hono)  │
│   radar-quant-brasil        │
│   .workers.dev              │
└────────────┬────────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌─────────┐     ┌──────────────────────┐
│  D1     │     │  KV Namespace        │
│  scans  │     │  operator:snapshot   │
│  (hist) │     │  optimization:latest │
└─────────┘     └──────────────────────┘
                         ▲
                         │ GET /api/*
                ┌────────┴────────┐
                │  Cloudflare     │
                │  Pages          │
                │  (React 19 +    │
                │   Vite + TW v3) │
                └─────────────────┘
```

## Pré-requisitos

- Node.js 18+
- npm 9+
- Conta Cloudflare com Workers e D1 habilitados
- `npx wrangler login` configurado

## Setup local

1. Clonar o repositório
2. Instalar dependências do worker:
   ```powershell
   cd dashboard\worker
   npm install
   ```
3. Instalar dependências do frontend:
   ```powershell
   cd dashboard\frontend
   npm install
   ```
4. Criar arquivo de variáveis locais do worker:
   ```powershell
   Copy-Item dashboard\worker\.dev.vars.example dashboard\worker\.dev.vars
   # Editar .dev.vars e preencher INGEST_SECRET (e opcionalmente INGEST_HMAC_SECRET)
   ```
5. Subir o worker em desenvolvimento:
   ```powershell
   cd dashboard\worker
   npx wrangler dev
   # Disponível em http://localhost:8787
   ```
6. Subir o frontend em desenvolvimento:
   ```powershell
   cd dashboard\frontend
   npm run dev
   # Disponível em http://localhost:5173 (aponta para :8787 via VITE_API_URL)
   ```

## Variáveis de ambiente

| Variável | Onde | Obrigatória | Descrição |
|---|---|---|---|
| `INGEST_SECRET` | Worker (secret) | Sim | Segredo de autenticação do header `x-ingest-secret` |
| `INGEST_HMAC_SECRET` | Worker (secret) | Não | Habilita verificação HMAC-SHA256 nos payloads (`x-signature` + `x-timestamp`) |
| `CORS_ORIGINS` | Worker (var / wrangler.toml) | Sim | Origens permitidas no CORS (ex: `https://radar-quant-brasil.pages.dev`) |
| `VITE_API_URL` | Frontend (.env) | Sim | URL base do worker para o frontend (ex: `https://radar-quant-brasil.prospects-intel.workers.dev`) |

> Em desenvolvimento, `INGEST_SECRET` e `INGEST_HMAC_SECRET` devem estar em `dashboard/worker/.dev.vars`.

## Pipeline de ingestão

### POST /api/ingest/scan — histórico de scans

Persiste um scan no D1 para exibição no histórico com comparação de regimes.

**Headers obrigatórios:**

```
x-ingest-secret: <INGEST_SECRET>
Content-Type: application/json
```

**Headers opcionais (quando HMAC habilitado):**

```
x-signature: <hmac-sha256-hex>
x-timestamp: <unix-timestamp>
```

**Payload:**

```json
{
  "scanId": "scan-2025-01-15-001",
  "marketDate": "2025-01-15",
  "generatedAt": "2025-01-15T10:00:00Z",
  "schemaVersion": "1",
  "items": [
    {
      "symbol": "PETR4",
      "score": 82,
      "regime": "tendencia",
      "signal": "LONG"
    }
  ]
}
```

**Exemplo com curl.exe (PowerShell):**

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/scan `
  -H "x-ingest-secret: SEU_SECRET" `
  -H "Content-Type: application/json" `
  -d '{\"scanId\":\"scan-2025-01-15-001\",\"marketDate\":\"2025-01-15\",\"generatedAt\":\"2025-01-15T10:00:00Z\",\"schemaVersion\":\"1\",\"items\":[{\"symbol\":\"PETR4\",\"score\":82,\"regime\":\"tendencia\",\"signal\":\"LONG\"}]}'
```

### POST /api/ingest/optimization — resultados de otimização

Armazena array de resultados de otimização de estratégia no KV (chave `optimization:latest`).

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/optimization `
  -H "x-ingest-secret: SEU_SECRET" `
  -H "Content-Type: application/json" `
  -d '[{\"params\":{\"orPeriod\":15,\"stopATR\":1.5},\"sharpe\":1.8,\"winRate\":0.62}]'
```

### POST /api/ingest/operator — snapshot ao vivo

Armazena snapshot do modo operador no KV (chave `operator:snapshot`). Limite: 64 KB.

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/operator `
  -H "x-ingest-secret: SEU_SECRET" `
  -H "Content-Type: application/json" `
  -d '{\"symbol\":\"WIN$N\",\"last\":135000,\"orHigh\":135200,\"orLow\":134800,\"vwap\":135050,\"stopPrice\":134750,\"targetPrice\":135600,\"signal\":\"LONG\",\"orbActive\":true,\"timestamp\":\"2025-01-15T10:30:00Z\"}'
```

## Deploy

### 1. Worker

```powershell
cd dashboard\worker
npx wrangler deploy
```

### 2. Migrations D1

Aplicar migrações no banco remoto:

```powershell
cd dashboard\worker
npx wrangler d1 migrations apply radar-quant --remote
```

### 3. Secrets

```powershell
# No PowerShell, usar echo com pipe não funciona como no bash
# Alternativa: wrangler secret put solicita input interativo
cd dashboard\worker
npx wrangler secret put INGEST_SECRET
# (digitar o valor quando solicitado)

npx wrangler secret put INGEST_HMAC_SECRET
# (opcional — deixar em branco desabilita HMAC)
```

### 4. Frontend

```powershell
cd dashboard\frontend
npm run build
npx wrangler pages deploy dist --project-name radar-quant-brasil --branch main
```

## Modo Operador

O modo operador exibe snapshot ao vivo com ORB Zone, VWAP e checklist de risco. O frontend faz polling a cada 30 segundos no endpoint `GET /api/operator/snapshot`.

**Enviar snapshot ao vivo:**

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/operator `
  -H "x-ingest-secret: SEU_SECRET" `
  -H "Content-Type: application/json" `
  -d '{\"symbol\":\"WIN$N\",\"last\":135000,\"orHigh\":135200,\"orLow\":134800,\"vwap\":135050,\"stopPrice\":134750,\"targetPrice\":135600,\"signal\":\"LONG\",\"orbActive\":true,\"timestamp\":\"2025-01-15T10:30:00Z\"}'
```

## Validação

### Testar autenticação (deve retornar 401)

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/scan `
  -H "x-ingest-secret: secret-errado" `
  -H "Content-Type: application/json" `
  -d '{}'
# Esperado: {"error":"Unauthorized"}
```

### Testar payload inválido (deve retornar 400)

```powershell
curl.exe -s -X POST https://radar-quant-brasil.prospects-intel.workers.dev/api/ingest/scan `
  -H "x-ingest-secret: SEU_SECRET" `
  -H "Content-Type: application/json" `
  -d '{\"marketDate\":\"2025-01-15\",\"items\":[]}'
# Esperado: {"error":"Invalid payload: scanId required"}
```

### Verificar saúde do worker

```powershell
curl.exe -s https://radar-quant-brasil.prospects-intel.workers.dev/api/health
# Esperado: 200 OK
```

## URLs

| Ambiente | URL |
|---|---|
| Worker (produção) | `https://radar-quant-brasil.prospects-intel.workers.dev` |
| Frontend (produção) | `https://radar-quant-brasil.pages.dev` |
| Worker (desenvolvimento) | `http://localhost:8787` |
| Frontend (desenvolvimento) | `http://localhost:5173` |

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787'
const INGEST_SECRET = process.env.INGEST_SECRET ?? 'dev-secret'

const docJson = process.argv[2]

if (!docJson) {
  console.error('Uso: npx tsx scripts/push-signal.ts \'{"signalId":"...","symbol":"...",...}\'')
  process.exit(1)
}

let doc: unknown
try {
  doc = JSON.parse(docJson)
} catch {
  console.error('Erro: JSON inválido no argumento')
  process.exit(1)
}

fetch(`${WORKER_URL}/api/ingest/signal`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-ingest-secret': INGEST_SECRET,
  },
  body: JSON.stringify(doc),
})
  .then(async (r) => {
    if (!r.ok) {
      const text = await r.text()
      throw new Error(`HTTP ${r.status}: ${text}`)
    }
    return r.json()
  })
  .then(console.log)
  .catch((err: Error) => {
    console.error('Erro:', err.message)
    process.exit(1)
  })

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787'
const INGEST_SECRET = process.env.INGEST_SECRET ?? 'dev-secret'

const snapshotJson = process.argv[2]

if (!snapshotJson) {
  console.error('Uso: npx tsx scripts/push-operator-snapshot.ts \'{"symbol":"...","last":...}\'')
  process.exit(1)
}

let snapshot: unknown
try {
  snapshot = JSON.parse(snapshotJson)
} catch {
  console.error('Erro: JSON inválido no argumento')
  process.exit(1)
}

fetch(`${WORKER_URL}/api/ingest/operator`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-ingest-secret': INGEST_SECRET,
  },
  body: JSON.stringify({
    ...(snapshot as object),
    timestamp: new Date().toISOString(),
  }),
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

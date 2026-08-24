import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787'
const INGEST_SECRET = process.env.INGEST_SECRET ?? 'dev-secret'

async function push(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ingest-secret': INGEST_SECRET,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Push failed ${path} [${res.status}]: ${text}`)
  }
}

async function syncScans(): Promise<void> {
  const scansDir = join(import.meta.dirname, '..', 'scans')
  const files = readdirSync(scansDir).filter(
    (f) => f.startsWith('radar-') && f.endsWith('.json')
  )

  for (const file of files) {
    const raw = readFileSync(join(scansDir, file), 'utf-8')
    const scan = JSON.parse(raw)
    console.log(`Syncing scan ${scan.marketDate} (${file})...`)
    await push('/api/ingest/scan', scan)
    console.log(`  ✓ ${scan.marketDate}`)
  }
}

async function syncOptimization(): Promise<void> {
  const filePath = join(import.meta.dirname, '..', 'scans', 'orb_vwap_optimization.json')
  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)
  console.log(`Syncing ${data.length} optimization records...`)
  await push('/api/ingest/optimization', data)
  console.log(`  ✓ ${data.length} records`)
}

async function main(): Promise<void> {
  console.log(`Worker: ${WORKER_URL}`)
  await syncScans()
  await syncOptimization()
  console.log('\nSync completo.')
}

main().catch((err) => {
  console.error('Erro:', err.message)
  process.exit(1)
})

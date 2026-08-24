import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { radarRoutes } from './routes/radar'
import { optimizationRoutes } from './routes/optimization'
import { operatorRoutes } from './routes/operator'
import { ingestRoutes } from './routes/ingest'
import { signalRoutes } from './routes/signals'
import { convergenceRoutes } from './routes/convergence'
import { watchlistRoutes } from './routes/watchlist'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
  INGEST_SECRET: string
  INGEST_HMAC_SECRET?: string
  CORS_ORIGINS?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', async (c, next) => {
  const origins = (c.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return cors({
    // Fail-closed: sem CORS_ORIGINS, nenhuma origem passa (lista vazia). Um
    // deploy que perca a var nao abre o Worker para qualquer origem em silencio.
    origin: origins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'x-ingest-secret', 'x-signature', 'x-timestamp'],
  })(c, next)
})

app.route('/api/radar', radarRoutes)
app.route('/api/optimization', optimizationRoutes)
app.route('/api/operator', operatorRoutes)
app.route('/api/ingest', ingestRoutes)
app.route('/api/signals', signalRoutes)
app.route('/api/convergence', convergenceRoutes)
app.route('/api/watchlist', watchlistRoutes)

app.get('/api/health', (c) => c.json({ ok: true }))

export default app

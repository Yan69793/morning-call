import { Hono } from 'hono'
import { getLatestScan, getScanByDate, listScanDates } from '../db/queries'

type Bindings = { DB: D1Database; KV: KVNamespace }
export const radarRoutes = new Hono<{ Bindings: Bindings }>()

radarRoutes.get('/latest', async (c) => {
  const row = await getLatestScan(c.env.DB)
  if (!row) return c.json({ error: 'No scan found' }, 404)
  return c.json(JSON.parse(row.payload))
})

radarRoutes.get('/dates', async (c) => {
  const { results } = await listScanDates(c.env.DB)
  return c.json(results)
})

radarRoutes.get('/:date', async (c) => {
  const date = c.req.param('date')
  const row = await getScanByDate(c.env.DB, date)
  if (!row) return c.json({ error: 'Scan not found' }, 404)
  return c.json(JSON.parse(row.payload))
})

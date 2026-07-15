import { Hono } from 'hono'

type Bindings = { KV: KVNamespace }
export const optimizationRoutes = new Hono<{ Bindings: Bindings }>()

optimizationRoutes.get('/', async (c) => {
  const data = await c.env.KV.get('optimization:latest', 'json')
  if (!data) return c.json({ error: 'No optimization data' }, 404)
  return c.json(data)
})

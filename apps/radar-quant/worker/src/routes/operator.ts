import { Hono } from 'hono'

type Bindings = { KV: KVNamespace }
export const operatorRoutes = new Hono<{ Bindings: Bindings }>()

operatorRoutes.get('/', async (c) => {
  const data = await c.env.KV.get('operator:snapshot', 'json')
  if (!data) return c.json({ error: 'No operator snapshot' }, 404)
  return c.json(data)
})

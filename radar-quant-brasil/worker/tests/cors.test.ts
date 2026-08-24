import { describe, it, expect } from 'vitest'
import app from '../src/index'

// O middleware de CORS nao pode fazer fail-open: se CORS_ORIGINS sumir num
// deploy, o Worker nao deve liberar qualquer origem. Sem a var, nenhuma origem
// e permitida (lista vazia), entao a resposta nao ecoa '*' nem a origem que
// pediu.
describe('CORS fail-closed', () => {
  it('sem CORS_ORIGINS, nao ecoa a origem do requisitante nem "*"', async () => {
    const res = await app.request(
      '/api/health',
      { headers: { Origin: 'https://atacante.example' } },
      { CORS_ORIGINS: undefined } as unknown as Record<string, unknown>,
    )

    const allow = res.headers.get('access-control-allow-origin')
    expect(allow).not.toBe('*')
    expect(allow).not.toBe('https://atacante.example')
  })

  it('com CORS_ORIGINS, a origem listada continua permitida', async () => {
    const res = await app.request(
      '/api/health',
      { headers: { Origin: 'https://radar-quant-brasil.pages.dev' } },
      { CORS_ORIGINS: 'https://radar-quant-brasil.pages.dev' } as unknown as Record<string, unknown>,
    )

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://radar-quant-brasil.pages.dev',
    )
  })
})

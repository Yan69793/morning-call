// Integração: contrato + render a partir da fixture de saída.
// Portado de integration.test.mjs para Vitest/TS
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateRadar } from '@sz/analytics'

const __dir = dirname(fileURLToPath(import.meta.url))
const normal = JSON.parse(readFileSync(join(__dir, 'fixtures/normal.json'), 'utf8'))

describe('validateRadar', () => {
  it('fixture normal passa no contrato', () => {
    const v = validateRadar(normal)
    expect(v.ok).toBe(true)
  })

  it('rejeita items vazio', () => {
    const v = validateRadar({ ...normal, items: [] })
    expect(v.ok).toBe(false)
  })

  it('rejeita semver malformado', () => {
    const v = validateRadar({ ...normal, schemaVersion: '1.0' })
    expect(v.ok).toBe(false)
  })
})

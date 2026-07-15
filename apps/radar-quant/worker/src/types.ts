/**
 * Ponte para o núcleo compartilhado.
 *
 * Este arquivo era uma CÓPIA literal de `shared/types.ts`, mantida em sincronia à mão por
 * `scripts/type-sync.ps1` — um script que só sabia detectar a divergência depois que ela
 * acontecia e mandar `cp` por cima. Com o workspace `@sz/analytics`, divergir deixou de ser
 * possível: existe um tipo só, e ele mora num lugar só.
 *
 * O arquivo continua existindo para não quebrar os `from '../types'` espalhados pelas rotas.
 */
export * from "@sz/analytics/types";

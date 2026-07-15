/**
 * Ponte para o núcleo compartilhado.
 *
 * Era a terceira cópia de `shared/types.ts` (as outras: `worker/src/types.ts` e o próprio
 * `shared/types.ts`), conferida por `npm run type-sync`. O workspace `@sz/analytics` substitui a
 * conferência pela impossibilidade: não há o que sincronizar quando só existe um arquivo.
 */
export * from "@sz/analytics/types";

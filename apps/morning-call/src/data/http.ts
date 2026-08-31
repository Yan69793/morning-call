/**
 * fetch com timeout, default dos providers quando `ctx.fetchFn` nao vem injetado (testes seguem
 * passando o proprio mock e nao passam por aqui).
 *
 * MC-017: todo provider caia em `fetch` cru. Um endpoint pendurado (sem resposta, sem erro) nunca
 * resolvia nem rejeitava a Promise, e o step do Workflow que espera esse fetch fica preso pra
 * sempre, run gravada em D1 com status "running" e nunca mais atualizada.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

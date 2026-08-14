// Stub mínimo para resolver o specifier "cloudflare:workers" no vitest.
// No runtime de produção o wrangler resolve o pacote real; nos testes o
// Workflow nunca é instanciado (env.WORKFLOW é mockado). O tsc resolve o
// mesmo specifier via @cloudflare/workers-types, então este stub só precisa
// compilar e importar.
export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  protected env: Env;
  protected declare params?: Params;
  constructor(_ctx: unknown, env: Env) {
    this.env = env;
  }
  run(): Promise<unknown> {
    throw new Error("Workflow real não disponível em teste");
  }
}

export interface WorkflowEvent<Params = unknown> {
  payload: Params;
}

export interface WorkflowStep {
  do<T>(_name: string, _fn: () => Promise<T>): Promise<T>;
}

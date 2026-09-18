/**
 * Fakes dos testes de desfecho de falha terminal (cartão t_08bd0538).
 *
 * O repo não tinha fake de D1 (`prepare(` não aparecia em `tests/`). A superfície que
 * `src/db/runs.ts` usa é só `prepare(sql)` → `bind(...)` → `run()` (escrita) e `first()`
 * (leitura), então gravar SQL + binds é suficiente para provar qual UPDATE chegou ao banco.
 */
import type { WorkflowStep } from "cloudflare:workers";

export interface Escrita {
  sql: string;
  binds: unknown[];
}

export interface FakeD1Options {
  /** Se definido, todo `run()` rejeita com este erro (testa a rede de segurança do helper). */
  runError?: Error;
  /** Se definido, toda `first()` rejeita com este erro (simula falha de leitura no step 1). */
  firstError?: Error;
}

class FakeStatement {
  private binds: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly db: FakeD1,
  ) {}

  bind(...binds: unknown[]): this {
    this.binds = binds;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const erro = this.db.opcoes.firstError;
    if (erro) return Promise.reject(erro);
    return Promise.resolve(null);
  }

  run(): Promise<{ success: true }> {
    this.db.registrar(this.sql, this.binds);
    return Promise.resolve({ success: true });
  }
}

export class FakeD1 {
  readonly escritas: Escrita[] = [];

  constructor(readonly opcoes: FakeD1Options = {}) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }

  registrar(sql: string, binds: unknown[]): void {
    if (this.opcoes.runError) throw this.opcoes.runError;
    this.escritas.push({ sql, binds });
  }
}

/** Quantas tentativas o motor de Workflows faz antes de desistir (medido: 7, ver contrato). */
export const TENTATIVAS_DO_MOTOR = 7;

/** UPDATEs que fecharam a run como falha para um `trade_date`. */
export function escritasDeFalha(escritas: Escrita[], tradeDate: string): Escrita[] {
  return escritas.filter(
    (e) =>
      /UPDATE\s+runs/i.test(e.sql) &&
      /status\s*=\s*'failed'/i.test(e.sql) &&
      e.binds.includes(tradeDate),
  );
}

/** Escritas em uma tabela, por prefixo do comando (ex.: "INSERT INTO reports"). */
export function escritasEm(escritas: Escrita[], comando: string): Escrita[] {
  const alvo = comando.toLowerCase();
  return escritas.filter((e) => e.sql.toLowerCase().includes(alvo));
}

export interface OpcoesStepFalso {
  /** Quantas vezes o motor chama o callback antes de propagar o último erro. */
  tentativas: number;
  /**
   * Resultado já persistido por nome de step: modela o replay do motor, que devolve o
   * resultado gravado sem reexecutar o callback.
   */
  prontos?: Record<string, unknown>;
  /** Chamado no instante em que o motor desiste, ANTES de propagar o último erro. */
  aoEsgotar?: (erro: unknown, nome: string) => void;
}

export interface StepFalso {
  do<T>(nome: string, fn: () => Promise<T>): Promise<T>;
  /** Nomes de step cujo callback foi executado de verdade (não replay). */
  executados: string[];
}

/**
 * Step que se comporta como o motor: repete o callback até `tentativas` e então desiste.
 * `aoEsgotar` roda antes do throw final, que é exatamente o instante em que uma instância
 * de Workflows pode morrer sem devolver o controle ao `run()`.
 */
export function criarStepFalso(opcoes: OpcoesStepFalso): StepFalso {
  const executados: string[] = [];
  return {
    executados,
    async do<T>(nome: string, fn: () => Promise<T>): Promise<T> {
      if (opcoes.prontos && nome in opcoes.prontos) return opcoes.prontos[nome] as T;
      executados.push(nome);
      let ultimo: unknown;
      for (let tentativa = 1; tentativa <= opcoes.tentativas; tentativa++) {
        try {
          return await fn();
        } catch (err) {
          ultimo = err;
        }
      }
      opcoes.aoEsgotar?.(ultimo, nome);
      throw ultimo;
    },
  };
}

/** Step falso pronto para passar como `WorkflowStep` (`do` é a única superfície usada). */
export function comoWorkflowStep(step: StepFalso): WorkflowStep {
  return step as unknown as WorkflowStep;
}

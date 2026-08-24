/**
 * Tipos locais para o relatorio Morning Call.
 * Espelha apps/morning-call/src/schemas/report.ts e trade.ts.
 * Mantido local porque @sz/analytics cobre o dominio do radar, nao do relatorio.
 */
import type { EconomicAgenda } from "./agenda";

export interface ExecutiveSummary {
  tensao_macro_dominante: string;
  regime: string;
  vies: string;
  conviccao: number;
  premissa_que_sustenta_precos: string;
  fato_que_quebraria: string;
}

export interface Scenario {
  nome: "base" | "bull" | "bear" | "cisne_cinza";
  probabilidade_pct: number;
  gatilhos_observaveis: string[];
  vencedores: string[];
  perdedores: string[];
  operacao_preferida: string;
  hedge: string;
  sinal_confirmacao: string;
  sinal_invalidacao: string;
}

export interface Traceability {
  fatos_verificados: string[];
  interpretacoes: string[];
  hipoteses: string[];
  dados_incompletos: string[];
}

export interface Provenance {
  run_id: string;
  model: string;
  prompt_version: string;
  generated_at: string;
}

export interface Quantity {
  value: number;
  unit: string;
}

export interface TradeEntryPreco {
  tipo: "preco";
  nivel: Quantity;
}

export interface TradeEntrySpread {
  tipo: "spread";
  nivel: Quantity;
}

export interface TradeEntryPremio {
  tipo: "premio";
  nivel: Quantity;
}

export type TradeEntry = TradeEntryPreco | TradeEntrySpread | TradeEntryPremio;

export interface TradeCardDraft {
  nome: string;
  classe: string;
  categoria: string;
  horizonte: string;
  direcao: "comprar" | "vender";
  entrada: TradeEntry;
  alvo_1: Quantity;
  alvo_2: Quantity | null;
  invalidacao: {
    razao: string;
    nivel?: Quantity;
  };
  tese: string;
  erro_precificacao: string;
  catalisador: string;
  por_que_agora: string;
  por_que_nao_consensual: string;
  riscos_ocultos: string;
  plano_saida: string;
  estrutura_alternativa: string;
  correlacao_com_outras: string;
  retorno_potencial: Quantity;
  perda_maxima: Quantity;
  sizing_pct_orcamento_risco: number;
  conviccao: number;
  fontes: string[];
}

export interface TradeCard {
  id: string;
  draft: TradeCardDraft;
  risco_retorno: Quantity;
  provenance: Provenance;
}

export interface MorningCallReport {
  run_id: string;
  trade_date: string;
  generated_at: string;
  abertura: ExecutiveSummary;
  trades: TradeCard[];
  ranking: number[];
  cenarios: Scenario[];
  rastreabilidade: Traceability;
  provenance: Provenance;
  disclaimer: string;
}

/**
 * Formato real do campo `report` da resposta. O worker grava
 * `{ morningCall, validation, gateReasons, agenda }` em `reports.payload`
 * (ver saveReportPointer em apps/morning-call/src/db/runs.ts), nao o
 * MorningCallReport isolado. `agenda` fica null quando o calendario falha ou e
 * reprovado, porque aquele passo e best-effort e nao derruba a rodada.
 */
export interface MorningCallPayload {
  morningCall: MorningCallReport;
  validation?: unknown;
  gateReasons?: string[];
  agenda?: EconomicAgenda | null;
}

export interface MorningCallResponse {
  ok: boolean;
  trade_date?: string;
  generated_at?: string;
  regime?: string;
  vies?: string;
  conviccao?: number;
  n_trades?: number;
  aprovado?: boolean;
  report?: MorningCallReport;
  error?: string;
}

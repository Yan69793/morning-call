/**
 * Tipos locais para a Agenda Economica.
 * Espelha apps/morning-call/src/schemas/agenda.ts.
 */

export interface Quantity {
  value: number;
  unit: string;
}

export interface EconomicCalendarEvent {
  hora_brt: string;
  evento: string;
  pais: "BR" | "EUA" | "CN" | "JP" | "EZ" | "UK" | "GLOBAL";
  importancia: "alta" | "media" | "baixa";
  consenso: Quantity | null;
  anterior: Quantity | null;
  sensibilidade: string;
  ativos_expostos: string[];
  cenario_benigno: string;
  cenario_adverso: string;
  condicao_operar: string;
}

export interface PlanoPregao {
  antes_abertura: string[];
  durante_pregao: string[];
  proximo_fechamento: string[];
}

export interface EconomicAgenda {
  trade_date: string;
  generated_at: string;
  resumo: string;
  nivel_alerta: "baixo" | "moderado" | "elevado" | "critico" | "indisponivel";
  eventos: EconomicCalendarEvent[];
  plano_pregao: PlanoPregao;
  provenance: {
    run_id: string;
    model: string;
    prompt_version: string;
    generated_at: string;
  };
}

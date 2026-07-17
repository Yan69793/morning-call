/**
 * Agenda Economica — Secao 16 e 17 do MORNING_CALL_OTIMIZADO.md.
 *
 * EconomicCalendarEvent: um evento da agenda (IPCA, Payroll, FOMC...).
 * EconomicAgenda: documento completo com eventos, plano do pregao e proveniencia.
 *
 * O LLM recebe eventos crus do scraper e produz este schema com analise de impacto.
 * NUNCA gera eventos — apenas analisa os recebidos.
 */
import { z } from "zod";
import { Quantity, Provenance } from "./common.js";

/* ------------------------------------------------------------------ */
/* Evento individual                                                    */
/* ------------------------------------------------------------------ */

export const Importancia = z.enum(["alta", "media", "baixa"]);
export type Importancia = z.infer<typeof Importancia>;

export const Pais = z.enum(["BR", "EUA", "CN", "JP", "EZ", "UK", "GLOBAL"]);
export type Pais = z.infer<typeof Pais>;

export const EconomicCalendarEvent = z.object({
  hora_brt: z.string().regex(/^\d{2}:\d{2}$/, "formato HH:MM esperado"),
  evento: z.string().min(3),
  pais: Pais,
  importancia: Importancia,
  consenso: Quantity.nullable(),
  anterior: Quantity.nullable(),
  sensibilidade: z.string().min(10),
  ativos_expostos: z.array(z.string()).min(1),
  cenario_benigno: z.string().min(10),
  cenario_adverso: z.string().min(10),
  condicao_operar: z.string().min(10),
});
export type EconomicCalendarEvent = z.infer<typeof EconomicCalendarEvent>;

/* ------------------------------------------------------------------ */
/* Plano do pregao                                                      */
/* ------------------------------------------------------------------ */

export const PlanoPregao = z.object({
  antes_abertura: z.array(z.string().min(10)),
  durante_pregao: z.array(z.string().min(10)),
  proximo_fechamento: z.array(z.string().min(10)),
});
export type PlanoPregao = z.infer<typeof PlanoPregao>;

/* ------------------------------------------------------------------ */
/* Documento completo                                                   */
/* ------------------------------------------------------------------ */

export const NivelAlerta = z.enum(["baixo", "moderado", "elevado", "critico", "indisponivel"]);
export type NivelAlerta = z.infer<typeof NivelAlerta>;

export const EconomicAgenda = z.object({
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generated_at: z.string().datetime(),
  resumo: z.string().min(10),
  nivel_alerta: NivelAlerta,
  eventos: z.array(EconomicCalendarEvent),
  plano_pregao: PlanoPregao,
  provenance: Provenance,
});
export type EconomicAgenda = z.infer<typeof EconomicAgenda>;

/* ------------------------------------------------------------------ */
/* Evento cru do scraper (input para o LLM)                             */
/* ------------------------------------------------------------------ */

export const RawScrapedEvent = z.object({
  hora_brt: z.string(),
  evento: z.string(),
  pais: Pais,
  importancia_indicativa: Importancia.optional(),
  consenso: Quantity.nullable().optional(),
  anterior: Quantity.nullable().optional(),
});
export type RawScrapedEvent = z.infer<typeof RawScrapedEvent>;

export const RawAgendaInput = z.object({
  trade_date: z.string(),
  eventos: z.array(RawScrapedEvent),
  fonte: z.string(), // "investing.com" | "forexfactory.com" | "estatica"
});
export type RawAgendaInput = z.infer<typeof RawAgendaInput>;

/* ------------------------------------------------------------------ */
/* Output do agente LLM (validado antes de selar)                       */
/* ------------------------------------------------------------------ */

export const CalendarAgentRaw = z.object({
  resumo: z.string().min(10),
  nivel_alerta: NivelAlerta,
  eventos: z.array(EconomicCalendarEvent),
  plano_pregao: PlanoPregao,
});
export type CalendarAgentRaw = z.infer<typeof CalendarAgentRaw>;

/**
 * Ficha de trade — o contrato crítico do sistema.
 * Ver MORNING_CALL_OTIMIZADO.md §11 e docs/RUNTIME_AGENTS.md §3.
 *
 * A ausência de qualquer campo obrigatório invalida o trade. Um trade que não valida não é
 * corrigido nem "melhor esforço": ele não entra no relatório.
 */
import { z } from "zod";
import { Provenance, Quantity, Rationale, Unit } from "./common.js";

export const Horizon = z.enum(["intraday", "swing", "tatico_1_3m", "estrategico_6_12m"]);
export type Horizon = z.infer<typeof Horizon>;

/**
 * Classificação econômica da operação (§11). É ortogonal à forma de entrada: um hedge tanto
 * pode ser montado a preço quanto por prêmio de opção, e um carry pode ser spot ou futuro.
 * Por isso a união discriminada abaixo é por `entrada.tipo`, não por `categoria`.
 */
export const TradeCategory = z.enum([
  "direcional",
  "valor_relativo",
  "carry",
  "convexidade",
  "hedge",
  "arbitragem_narrativa",
  "evento",
  "assimetria_cauda",
]);
export type TradeCategory = z.infer<typeof TradeCategory>;

/** Perna de uma estrutura (steepener, long/short, cesta). */
export const Leg = z.object({
  instrumento: z.string().min(1), // ex.: "DI1F27", "PETR4"
  lado: z.enum(["long", "short"]),
  peso: z.number().positive(), // relativo entre pernas; 1 e 1 = razão 1:1
});
export type Leg = z.infer<typeof Leg>;

export const OptionLeg = z.object({
  instrumento: z.string().min(1),
  lado: z.enum(["long", "short"]),
  tipo: z.enum(["call", "put"]),
  strike: Quantity,
  vencimento: z.iso.date(),
  peso: z.number().positive(),
});
export type OptionLeg = z.infer<typeof OptionLeg>;

/**
 * Como se entra na operação. O `entrada: z.number()` original só modelava o caso direcional:
 * um steepener DI entra em bps de inclinação, um call spread entra em prêmio, e uma cesta
 * long/short não tem preço único. Metade das categorias declaradas não cabia num número solto.
 */
export const Entry = z.discriminatedUnion("tipo", [
  /** Ativo único a preço: ação, moeda, índice, futuro. */
  z.object({
    tipo: z.literal("preco"),
    /**
     * Chave do ativo, no vocabulário do snapshot (ex.: "USDBRL", "IBOV").
     *
     * Os ramos `spread` e `premio` carregam o instrumento em cada perna; o `preco` não carregava
     * nenhum, o que deixava o trade direcional anônimo. Sem isto, o gate de correlação do AD-7 não
     * tem como saber de que ativo o trade fala, e era exatamente por isso que
     * `trades_correlacionados_sem_justificativa` vivia hardcoded como lista vazia.
     */
    instrumento: z.string().min(1),
    nivel: Quantity,
    faixa: z.object({ min: Quantity, max: Quantity }),
  }),
  /** Estrutura de valor relativo: steepener/flattener, butterfly, long/short, cesta. */
  z.object({
    tipo: z.literal("spread"),
    nivel: Quantity, // tipicamente em bps
    faixa: z.object({ min: Quantity, max: Quantity }),
    pernas: z.array(Leg).min(2),
  }),
  /** Estrutura de opções: entrada é o prêmio líquido pago (long) ou recebido (short). */
  z.object({
    tipo: z.literal("premio"),
    nivel: Quantity,
    faixa: z.object({ min: Quantity, max: Quantity }),
    pernas: z.array(OptionLeg).min(1),
  }),
]);
export type Entry = z.infer<typeof Entry>;

export const Invalidation = z.object({
  /** Condição objetiva. §19 proíbe "manter cautela" e afins aqui. */
  descricao: Rationale,
  /** Nível que dispara a saída, quando existe. Evento sem preço (ex.: Copom) fica null. */
  nivel: Quantity.nullable(),
});

const unidadesBatem = (qs: Quantity[]): boolean => qs.every((q) => q.unit === qs[0]!.unit);

/**
 * O que o LLM produz. Note o que NÃO está aqui: `risco_retorno`. Ele é derivado em código a
 * partir de retorno e perda (CLAUDE.md §3: LLM interpreta número, não produz).
 */
export const TradeCardDraft = z
  .object({
    nome: z.string().min(1),
    classe: z.string().min(1), // ex.: "juros BR", "câmbio", "equities BR"
    categoria: TradeCategory,
    horizonte: Horizon,
    direcao: z.enum(["comprar", "vender"]), // sobre o objeto da entrada: preço, spread ou estrutura
    entrada: Entry,
    alvo_1: Quantity,
    alvo_2: Quantity,
    invalidacao: Invalidation,

    tese: Rationale,
    erro_precificacao: Rationale,
    catalisador: Rationale,
    por_que_agora: Rationale,
    por_que_nao_consensual: Rationale,
    riscos_ocultos: Rationale,
    plano_saida: Rationale,
    estrutura_alternativa: Rationale,
    correlacao_com_outras: Rationale,

    retorno_potencial: Quantity,
    perda_maxima: Quantity,
    sizing_pct_orcamento_risco: z.number().gt(0).max(100),
    conviccao: z.number().min(0).max(10),

    /** Sem fonte, o trade não passa. Referencia Source.name do snapshot. */
    fontes: z.array(z.string().min(1)).min(1),
  })
  // Comparar grandezas de unidades diferentes é o erro silencioso mais caro aqui: 25 bps contra
  // 25% passa por qualquer checagem numérica ingênua. Alvos e faixa vivem na unidade da entrada.
  .refine((t) => unidadesBatem([t.entrada.nivel, t.entrada.faixa.min, t.entrada.faixa.max]), {
    message: "faixa de entrada precisa estar na mesma unidade do nível de entrada",
    path: ["entrada", "faixa"],
  })
  .refine((t) => unidadesBatem([t.entrada.nivel, t.alvo_1, t.alvo_2]), {
    message: "alvos precisam estar na mesma unidade da entrada",
    path: ["alvo_1"],
  })
  .refine((t) => t.entrada.faixa.min.value <= t.entrada.faixa.max.value, {
    message: "faixa de entrada invertida (min > max)",
    path: ["entrada", "faixa"],
  })
  .refine(
    (t) =>
      t.entrada.nivel.value >= t.entrada.faixa.min.value &&
      t.entrada.nivel.value <= t.entrada.faixa.max.value,
    { message: "nível de entrada fora da própria faixa de entrada", path: ["entrada", "nivel"] },
  )
  // Direção e alvos precisam concordar: um "comprar" com alvo abaixo da entrada é erro de
  // raciocínio do modelo, e o red team não pega isso porque o texto da tese soa perfeito.
  .refine(
    (t) =>
      t.direcao === "comprar"
        ? t.alvo_1.value > t.entrada.nivel.value
        : t.alvo_1.value < t.entrada.nivel.value,
    { message: "alvo_1 contradiz a direção da operação", path: ["alvo_1"] },
  )
  .refine(
    (t) =>
      Math.abs(t.alvo_2.value - t.entrada.nivel.value) >
      Math.abs(t.alvo_1.value - t.entrada.nivel.value),
    { message: "alvo_2 precisa ser mais distante da entrada que alvo_1", path: ["alvo_2"] },
  )
  .refine(
    (t) =>
      t.invalidacao.nivel === null ||
      (t.direcao === "comprar"
        ? t.invalidacao.nivel.value < t.entrada.nivel.value
        : t.invalidacao.nivel.value > t.entrada.nivel.value),
    { message: "invalidação está do lado errado da entrada", path: ["invalidacao", "nivel"] },
  )
  .refine((t) => t.retorno_potencial.value > 0 && t.perda_maxima.value > 0, {
    message: "retorno e perda são magnitudes, sempre positivas; a direção vem de `direcao`",
    path: ["perda_maxima"],
  })
  .refine((t) => t.retorno_potencial.unit === t.perda_maxima.unit, {
    message: "retorno e perda precisam compartilhar unidade para o risco-retorno significar algo",
    path: ["perda_maxima"],
  });
export type TradeCardDraft = z.infer<typeof TradeCardDraft>;

/**
 * Todos os instrumentos que um trade toca, qualquer que seja a forma de entrada.
 *
 * Existe para o gate de correlação: dois trades são redundantes quando tocam ativos correlacionados,
 * e para saber isso é preciso primeiro saber que ativos são. Um steepener toca as duas pernas; um
 * call spread, as duas opções; um direcional, o seu único ativo.
 */
export function tradeInstrumentos(draft: TradeCardDraft): string[] {
  const e = draft.entrada;
  switch (e.tipo) {
    case "preco":
      return [e.instrumento];
    case "spread":
    case "premio":
      return e.pernas.map((p) => p.instrumento);
  }
}

/**
 * Deriva o risco-retorno. Única fonte do número: nenhum agente pode declará-lo.
 * O original tinha `risco_retorno: z.number()` ao lado de retorno e perda em texto livre, ou
 * seja, o comitê pontuava assimetria com um número que ninguém checava contra seus insumos.
 */
export function riscoRetorno(draft: TradeCardDraft): Quantity {
  return {
    value: draft.retorno_potencial.value / draft.perda_maxima.value,
    unit: "ratio" satisfies Unit,
  };
}

/** Ficha completa: o que o LLM propôs, o que o código derivou, e de onde veio. */
export const TradeCard = z.object({
  id: z.uuid(),
  draft: TradeCardDraft,
  risco_retorno: Quantity,
  provenance: Provenance,
});
export type TradeCard = z.infer<typeof TradeCard>;

/** Monta a ficha final a partir do rascunho validado, derivando o que for derivável. */
export function sealTradeCard(
  draft: TradeCardDraft,
  id: string,
  provenance: Provenance,
): TradeCard {
  return TradeCard.parse({ id, draft, risco_retorno: riscoRetorno(draft), provenance });
}

export const RedTeamVerdict = z.object({
  trade_id: z.uuid(),
  veredito: z.enum(["aprovar", "rejeitar", "revisar"]),
  premissa_mais_fragil: Rationale,
  ja_precificado: z.boolean(),
  carry_negativo: z.boolean(),
  risco_de_gap: z.boolean(),
  hedge_destroi_retorno: z.boolean(),
  correlacao_oculta: z.string().nullable(),
  evidencia_contraria: Rationale,
  provenance: Provenance,
});
export type RedTeamVerdict = z.infer<typeof RedTeamVerdict>;

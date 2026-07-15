import { describe, expect, it } from "vitest";
import {
  correlacaoEntreTrades,
  filterPublishableTrades,
  gateTrade,
  runGates,
  type Correlacao,
} from "../../src/committee/gates.js";
import { sealTradeCard, TradeCardDraft, type TradeCard } from "../../src/schemas/trade.js";
import type { MarketSnapshot } from "../../src/schemas/data.js";
import type { Provenance } from "../../src/schemas/common.js";

const RUN_ID = "6f1c1f9a-0b3a-4c2e-9f5b-2a8d1e7c4a10";
const prov: Provenance = {
  run_id: RUN_ID,
  model: "test/mock",
  prompt_version: "test@2026-07-15",
  generated_at: "2026-07-15T09:31:00.000Z",
};

const TXT = "Texto suficientemente longo para satisfazer o Rationale de vinte caracteres.";

function draft(over: Record<string, unknown> = {}): unknown {
  return {
    nome: "Long USD/BRL",
    classe: "câmbio",
    categoria: "direcional",
    horizonte: "swing",
    direcao: "comprar",
    entrada: {
      tipo: "preco",
      instrumento: "USDBRL",
      nivel: { value: 5.4, unit: "BRL_por_USD" },
      faixa: {
        min: { value: 5.38, unit: "BRL_por_USD" },
        max: { value: 5.44, unit: "BRL_por_USD" },
      },
    },
    alvo_1: { value: 5.55, unit: "BRL_por_USD" },
    alvo_2: { value: 5.7, unit: "BRL_por_USD" },
    invalidacao: { descricao: TXT, nivel: { value: 5.32, unit: "BRL_por_USD" } },
    tese: TXT,
    erro_precificacao: TXT,
    catalisador: TXT,
    por_que_agora: TXT,
    por_que_nao_consensual: TXT,
    riscos_ocultos: TXT,
    plano_saida: TXT,
    estrutura_alternativa: TXT,
    correlacao_com_outras: TXT,
    retorno_potencial: { value: 3.0, unit: "pct" },
    perda_maxima: { value: 1.0, unit: "pct" },
    sizing_pct_orcamento_risco: 15,
    conviccao: 7,
    fontes: ["BCB PTAX"],
    ...over,
  };
}

let seq = 0;
function card(over: Record<string, unknown> = {}): TradeCard {
  const d = TradeCardDraft.parse(draft(over));
  seq += 1;
  const id = `b2b6b0c1-7e2d-4f8a-8c31-9d4f0a5e6b${String(seq).padStart(2, "0")}`;
  return sealTradeCard(d, id, prov);
}

const snapshotVazio: MarketSnapshot = {
  run_id: RUN_ID,
  trade_date: "2026-07-15",
  taken_at: "2026-07-15T09:30:00.000Z",
  points: [
    {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.42, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "BCB PTAX", tier: 1, retrieved_at: "2026-07-15T09:30:00.000Z" },
      as_of: "2026-07-14T16:00:00.000Z",
      observed_at: "2026-07-15T09:30:00.000Z",
    },
  ],
};

/**
 * Card que NÃO passou pelo parse, simulando o que entra por fora do schema: uma linha lida do D1,
 * um cache antigo, um payload de outra versão. É contra isso que os gates de fonte e invalidação
 * servem — pelo caminho normal eles são inalcançáveis, porque o schema barra antes (`Rationale`
 * exige 20 chars, `fontes` exige `.min(1)`).
 */
function cardCru(over: Record<string, unknown>): TradeCard {
  const base = card();
  return { ...base, draft: { ...base.draft, ...over } };
}

describe("gateTrade: um caminho só", () => {
  it("aprova trade completo", () => {
    expect(gateTrade(card())).toEqual([]);
  });

  it("reprova risco-retorno abaixo do mínimo", () => {
    // Este é o único dos três gates alcançável pelo caminho normal: risco_retorno é derivado,
    // então o schema não tem como barrá-lo — quem barra é o comitê.
    const t = card({
      retorno_potencial: { value: 1.0, unit: "pct" },
      perda_maxima: { value: 1.0, unit: "pct" },
    });
    expect(gateTrade(t).join(" ")).toContain("risco_retorno");
  });

  it("defesa em profundidade: card sem fonte, vindo por fora do parse, é barrado", () => {
    expect(gateTrade(cardCru({ fontes: [] }))).toContain("sem fonte");
  });

  it("defesa em profundidade: invalidação vaga vinda por fora do parse é barrada", () => {
    expect(gateTrade(cardCru({ invalidacao: { descricao: "cai", nivel: null } }))).toContain(
      "invalidação vaga",
    );
  });

  it("REGRESSÃO: os dois caminhos de gate concordam", () => {
    // runGates checava invalidação; filterPublishableTrades não. Um card reprovado por um saía
    // publicado pelo outro. Agora ambos chamam gateTrade, então divergir exigiria editar os dois.
    const t = cardCru({ invalidacao: { descricao: "cai", nivel: null } });
    const gates = runGates({ snapshot: snapshotVazio, claims: [], trades: [t] });
    const { published, rejected } = filterPublishableTrades([t], true);

    expect(gates.ok).toBe(false);
    expect(published).toHaveLength(0);
    expect(rejected[0]!.motivo).toContain("invalidação vaga");
  });
});

describe("gate de correlação", () => {
  const correlacoes: Correlacao[] = [{ a: "USDBRL", b: "DI1F31", rho: 0.85 }];

  function outro(over: Record<string, unknown> = {}): TradeCard {
    return card({
      nome: "Long DI jan31",
      entrada: {
        tipo: "preco",
        instrumento: "DI1F31",
        nivel: { value: 12, unit: "pct" },
        faixa: { min: { value: 11.9, unit: "pct" }, max: { value: 12.1, unit: "pct" } },
      },
      alvo_1: { value: 13, unit: "pct" },
      alvo_2: { value: 14, unit: "pct" },
      invalidacao: { descricao: TXT, nivel: { value: 11.5, unit: "pct" } },
      ...over,
    });
  }

  it("mede a correlação entre trades pelos instrumentos", () => {
    expect(correlacaoEntreTrades(card(), outro(), correlacoes)).toBe(0.85);
  });

  it("mesmo instrumento é correlação 1, sem precisar do quant", () => {
    expect(correlacaoEntreTrades(card(), card(), [])).toBe(1);
  });

  it("par ausente no quant devolve null: não saber não é correlação baixa", () => {
    expect(correlacaoEntreTrades(card(), outro(), [])).toBeNull();
  });

  it("barra o segundo trade redundante e registra o nome", () => {
    const { published, correlacionados } = filterPublishableTrades(
      [card(), outro()],
      true,
      correlacoes,
    );
    expect(published).toHaveLength(1);
    expect(correlacionados).toEqual(["Long DI jan31"]);
  });

  it("sobrevive o de melhor assimetria, não o que veio primeiro", () => {
    const fraco = card({
      nome: "fraco",
      retorno_potencial: { value: 2.0, unit: "pct" },
      perda_maxima: { value: 1.0, unit: "pct" },
    });
    const forte = outro({
      nome: "forte",
      retorno_potencial: { value: 9.0, unit: "pct" },
      perda_maxima: { value: 1.0, unit: "pct" },
    });
    const { published } = filterPublishableTrades([fraco, forte], true, correlacoes);
    expect(published.map((t) => t.draft.nome)).toEqual(["forte"]);
  });

  it("redundância declarada como hedge passa", () => {
    const hedge = outro({
      correlacao_com_outras: "É o hedge do long dólar: perde quando a outra ganha, de propósito.",
    });
    const { published, correlacionados } = filterPublishableTrades(
      [card(), hedge],
      true,
      correlacoes,
    );
    expect(published).toHaveLength(2);
    expect(correlacionados).toEqual([]);
  });

  it("sem dado de correlação, não barra nada: o gate não inventa número para opinar", () => {
    const { published } = filterPublishableTrades([card(), outro()], true, []);
    expect(published).toHaveLength(2);
  });
});

describe("cross-check contamina a rodada", () => {
  it("claim que não bate com o snapshot derruba todos os trades", () => {
    const gates = runGates({
      snapshot: snapshotVazio,
      claims: [{ snapshot_key: "USDBRL", valor_citado: { value: 54.2, unit: "BRL_por_USD" } }],
      trades: [card()],
    });
    expect(gates.ok).toBe(false);
    expect(gates.crossCheck.ok).toBe(false);

    const { published, rejected } = filterPublishableTrades([card()], gates.crossCheck.ok);
    expect(published).toHaveLength(0);
    expect(rejected[0]!.motivo).toContain("cross-check");
  });
});

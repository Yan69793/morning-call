import { describe, expect, it } from "vitest";
import {
  Provenance,
  TradeCardDraft,
  riscoRetorno,
  sealTradeCard,
  type TradeCardDraft as Draft,
} from "../../src/schemas/index.js";

const RUN_ID = "6f1c1f9a-0b3a-4c2e-9f5b-2a8d1e7c4a10";
const TRADE_ID = "b2b6b0c1-7e2d-4f8a-8c31-9d4f0a5e6b77";

const provenance: Provenance = {
  run_id: RUN_ID,
  model: "openrouter/test/mock-model",
  prompt_version: "test@2026-07-15",
  generated_at: "2026-07-15T09:31:00.000Z",
};

/** Direcional em USD/BRL: comprar a 5.40, alvos acima, stop abaixo. */
function direcional(over: Partial<Draft> = {}): unknown {
  return {
    nome: "Long USD/BRL",
    classe: "câmbio",
    categoria: "direcional",
    horizonte: "swing",
    direcao: "comprar",
    entrada: {
      tipo: "preco",
      nivel: { value: 5.4, unit: "BRL_por_USD" },
      faixa: {
        min: { value: 5.38, unit: "BRL_por_USD" },
        max: { value: 5.44, unit: "BRL_por_USD" },
      },
    },
    alvo_1: { value: 5.55, unit: "BRL_por_USD" },
    alvo_2: { value: 5.7, unit: "BRL_por_USD" },
    invalidacao: {
      descricao: "Fechamento abaixo de 5,32 por dois pregões consecutivos encerra a posição.",
      nivel: { value: 5.32, unit: "BRL_por_USD" },
    },
    tese: "Diferencial de juros comprime enquanto o risco fiscal segue mal precificado no câmbio.",
    erro_precificacao: "Vol implícita de 1 mês não reflete o calendário fiscal do trimestre.",
    catalisador: "Votação do arcabouço no Congresso, com relatório previsto para a semana.",
    por_que_agora:
      "Posicionamento vendido em dólar no maior nível desde janeiro, por dados da CFTC.",
    por_que_nao_consensual:
      "Consenso Focus projeta câmbio estável, sem prêmio para o risco fiscal.",
    riscos_ocultos: "Intervenção do BCB via leilão de linha pode conter a alta no curto prazo.",
    plano_saida: "Reduzir metade no alvo 1 e levar o restante com stop móvel na mínima de 3 dias.",
    estrutura_alternativa:
      "Call spread 5,50/5,80 de 60 dias, se a vol implícita ceder abaixo de 12.",
    correlacao_com_outras:
      "Correlação negativa com o long Ibovespa da carteira, medida em 63 dias.",
    retorno_potencial: { value: 3.0, unit: "pct" },
    perda_maxima: { value: 1.5, unit: "pct" },
    sizing_pct_orcamento_risco: 15,
    conviccao: 7,
    fontes: ["BCB PTAX", "CFTC COT"],
    ...over,
  };
}

/** Steepener DI: entra em bps de inclinação, sem preço único. */
function steepener(over: Partial<Draft> = {}): unknown {
  return {
    nome: "Steepener DI jan27/jan31",
    classe: "juros BR",
    categoria: "valor_relativo",
    horizonte: "tatico_1_3m",
    direcao: "comprar",
    entrada: {
      tipo: "spread",
      nivel: { value: 120, unit: "bps" },
      faixa: { min: { value: 115, unit: "bps" }, max: { value: 128, unit: "bps" } },
      pernas: [
        { instrumento: "DI1F27", lado: "short", peso: 1 },
        { instrumento: "DI1F31", lado: "long", peso: 1 },
      ],
    },
    alvo_1: { value: 150, unit: "bps" },
    alvo_2: { value: 175, unit: "bps" },
    invalidacao: {
      descricao: "Inclinação abaixo de 100 bps invalida a leitura de prêmio de prazo comprimido.",
      nivel: { value: 100, unit: "bps" },
    },
    tese: "Prêmio de prazo comprimido não remunera o risco fiscal da parte longa da curva.",
    erro_precificacao:
      "Curva precifica corte de juros sem exigir prêmio pela trajetória da dívida.",
    catalisador: "Relatório bimestral de receitas e despesas, com risco de contingenciamento.",
    por_que_agora: "Inclinação no primeiro decil da distribuição de 12 meses, medida pelo quant.",
    por_que_nao_consensual:
      "Consenso vê corte de Selic achatando a curva por mais dois trimestres.",
    riscos_ocultos: "Carry negativo do steepener consome retorno se a tese demorar a se realizar.",
    plano_saida: "Encerrar integralmente no alvo 2 ou na véspera do Copom, o que vier primeiro.",
    estrutura_alternativa: "Butterfly jan27/jan29/jan31, se a barriga da curva ficar cara demais.",
    correlacao_com_outras: "Baixa correlação com o long dólar, ambos ganham em stress fiscal.",
    retorno_potencial: { value: 55, unit: "bps" },
    perda_maxima: { value: 20, unit: "bps" },
    sizing_pct_orcamento_risco: 20,
    conviccao: 6,
    fontes: ["B3", "ANBIMA"],
    ...over,
  };
}

describe("TradeCardDraft, estruturas que o schema antigo não modelava", () => {
  it("aceita um direcional a preço", () => {
    expect(TradeCardDraft.safeParse(direcional()).success).toBe(true);
  });

  it("aceita um steepener que entra em bps de inclinação, sem preço único", () => {
    const parsed = TradeCardDraft.safeParse(steepener());
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.entrada.tipo === "spread") {
      expect(parsed.data.entrada.pernas).toHaveLength(2);
    }
  });

  it("aceita uma estrutura de opções que entra por prêmio", () => {
    const callSpread = direcional({
      nome: "Call spread USD/BRL 5,50/5,80",
      categoria: "convexidade",
      entrada: {
        tipo: "premio",
        nivel: { value: 0.06, unit: "BRL_por_USD" },
        faixa: {
          min: { value: 0.05, unit: "BRL_por_USD" },
          max: { value: 0.07, unit: "BRL_por_USD" },
        },
        pernas: [
          {
            instrumento: "USDBRL",
            lado: "long",
            tipo: "call",
            strike: { value: 5.5, unit: "BRL_por_USD" },
            vencimento: "2026-09-30",
            peso: 1,
          },
          {
            instrumento: "USDBRL",
            lado: "short",
            tipo: "call",
            strike: { value: 5.8, unit: "BRL_por_USD" },
            vencimento: "2026-09-30",
            peso: 1,
          },
        ],
      },
      alvo_1: { value: 0.12, unit: "BRL_por_USD" },
      alvo_2: { value: 0.2, unit: "BRL_por_USD" },
      invalidacao: {
        descricao: "Prêmio abaixo de 0,03 encerra a estrutura, com perda limitada ao pago.",
        nivel: { value: 0.03, unit: "BRL_por_USD" },
      },
    });
    expect(TradeCardDraft.safeParse(callSpread).success).toBe(true);
  });
});

describe("TradeCardDraft, o que precisa ser rejeitado", () => {
  it("rejeita trade sem invalidação", () => {
    const semInvalidacao = direcional();
    delete (semInvalidacao as Record<string, unknown>).invalidacao;
    expect(TradeCardDraft.safeParse(semInvalidacao).success).toBe(false);
  });

  it("rejeita trade sem fonte", () => {
    expect(TradeCardDraft.safeParse(direcional({ fontes: [] })).success).toBe(false);
  });

  it("rejeita alvo que contradiz a direção", () => {
    const r = TradeCardDraft.safeParse(direcional({ alvo_1: { value: 5.2, unit: "BRL_por_USD" } }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("contradiz a direção");
  });

  it("rejeita alvo_2 mais perto da entrada que alvo_1", () => {
    const r = TradeCardDraft.safeParse(
      direcional({ alvo_2: { value: 5.45, unit: "BRL_por_USD" } }),
    );
    expect(r.success).toBe(false);
  });

  it("rejeita invalidação do lado errado da entrada", () => {
    const r = TradeCardDraft.safeParse(
      direcional({
        invalidacao: {
          descricao: "Stop acima da entrada numa compra não é stop, é alvo disfarçado.",
          nivel: { value: 5.6, unit: "BRL_por_USD" },
        },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejeita mistura de bps com pct entre retorno e perda", () => {
    const r = TradeCardDraft.safeParse(steepener({ perda_maxima: { value: 20, unit: "pct" } }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("compartilhar unidade");
  });

  it("rejeita alvo em unidade diferente da entrada", () => {
    const r = TradeCardDraft.safeParse(steepener({ alvo_1: { value: 1.5, unit: "pct" } }));
    expect(r.success).toBe(false);
  });

  it("rejeita nível de entrada fora da própria faixa", () => {
    const r = TradeCardDraft.safeParse(
      direcional({
        entrada: {
          tipo: "preco",
          nivel: { value: 5.9, unit: "BRL_por_USD" },
          faixa: {
            min: { value: 5.38, unit: "BRL_por_USD" },
            max: { value: 5.44, unit: "BRL_por_USD" },
          },
        },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejeita spread com uma perna só", () => {
    const r = TradeCardDraft.safeParse(
      steepener({
        entrada: {
          tipo: "spread",
          nivel: { value: 120, unit: "bps" },
          faixa: { min: { value: 115, unit: "bps" }, max: { value: 128, unit: "bps" } },
          pernas: [{ instrumento: "DI1F31", lado: "long", peso: 1 }],
        },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejeita frase vaga onde §19 exige condição operacional", () => {
    // Rationale exige 20 caracteres: "manter cautela" não passa nem no comprimento.
    const r = TradeCardDraft.safeParse(direcional({ tese: "manter cautela" }));
    expect(r.success).toBe(false);
  });

  it("rejeita perda máxima negativa: magnitude, não sinal", () => {
    const r = TradeCardDraft.safeParse(direcional({ perda_maxima: { value: -1.5, unit: "pct" } }));
    expect(r.success).toBe(false);
  });
});

describe("risco_retorno é derivado, nunca declarado", () => {
  it("deriva do retorno e da perda", () => {
    const draft = TradeCardDraft.parse(direcional());
    expect(riscoRetorno(draft)).toEqual({ value: 2, unit: "ratio" });
  });

  it("não existe campo risco_retorno no rascunho do LLM", () => {
    const comRR = direcional() as Record<string, unknown>;
    comRR.risco_retorno = 99; // um modelo tentando declarar a própria assimetria
    const parsed = TradeCardDraft.parse(comRR);
    expect(parsed).not.toHaveProperty("risco_retorno");
    // e o número que vale continua sendo o derivado
    expect(riscoRetorno(parsed).value).toBe(2);
  });

  it("sela a ficha com id, proveniência e assimetria derivada", () => {
    const draft = TradeCardDraft.parse(steepener());
    const card = sealTradeCard(draft, TRADE_ID, provenance);
    expect(card.risco_retorno).toEqual({ value: 2.75, unit: "ratio" });
    expect(card.provenance.model).toBe("openrouter/test/mock-model");
    expect(card.id).toBe(TRADE_ID);
  });
});

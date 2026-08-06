import { describe, expect, it } from "vitest";
import {
  buildStrategistSystemPrompt,
  detectPromptEcho,
  parseStrategistContent,
  runStrategist,
  sealStrategistTrades,
} from "../../src/agents/strategist.js";
import type { MarketSnapshot } from "../../src/schemas/index.js";
import { runGates, filterPublishableTrades } from "../../src/committee/gates.js";
import { buildMorningCall } from "../../src/report/build.js";
import { validateMorningCall } from "../../src/report/validate.js";

const RUN = "11111111-2222-4333-8444-555555555555";

const snapshot: MarketSnapshot = {
  run_id: RUN,
  trade_date: "2026-07-15",
  taken_at: "2026-07-15T09:30:00.000Z",
  points: [
    {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.07, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "BCB PTAX", tier: 1, retrieved_at: "2026-07-15T09:20:00.000Z" },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: "2026-07-15T09:20:00.000Z",
    },
    {
      status: "OK",
      key: "SELIC_META",
      quantity: { value: 15.0, unit: "pct" },
      venue: "BR",
      source: { name: "BCB", tier: 1, retrieved_at: "2026-07-15T09:20:00.000Z" },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: "2026-07-15T09:20:00.000Z",
    },
  ],
};

const rationale =
  "Premissa operacional com mais de vinte caracteres para passar o schema Rationale.";

function validMockJson(claimSelic: number) {
  return JSON.stringify({
    abertura: {
      tensao_macro_dominante: rationale,
      regime: "transicao",
      vies: "neutro",
      conviccao: 5,
      premissa_que_sustenta_precos: rationale,
      fato_que_quebraria: rationale,
    },
    quant_claims: [
      { snapshot_key: "SELIC_META", valor_citado: { value: claimSelic, unit: "pct" } },
      { snapshot_key: "USDBRL", valor_citado: { value: 5.07, unit: "BRL_por_USD" } },
    ],
    trades: [
      {
        nome: "Long USD/BRL tático",
        classe: "câmbio",
        categoria: "direcional",
        horizonte: "swing",
        direcao: "comprar",
        entrada: {
          tipo: "preco",
          instrumento: "USDBRL",
          nivel: { value: 5.07, unit: "BRL_por_USD" },
          faixa: {
            min: { value: 5.0, unit: "BRL_por_USD" },
            max: { value: 5.1, unit: "BRL_por_USD" },
          },
        },
        alvo_1: { value: 5.25, unit: "BRL_por_USD" },
        alvo_2: { value: 5.4, unit: "BRL_por_USD" },
        invalidacao: {
          descricao: rationale,
          nivel: { value: 4.95, unit: "BRL_por_USD" },
        },
        tese: rationale,
        erro_precificacao: rationale,
        catalisador: rationale,
        por_que_agora: rationale,
        por_que_nao_consensual: rationale,
        riscos_ocultos: rationale,
        plano_saida: rationale,
        estrutura_alternativa: rationale,
        correlacao_com_outras: rationale,
        retorno_potencial: { value: 3, unit: "pct" },
        perda_maxima: { value: 1, unit: "pct" },
        sizing_pct_orcamento_risco: 5,
        conviccao: 6,
        fontes: ["BCB PTAX"],
      },
    ],
    cenarios: [
      {
        nome: "base",
        probabilidade_pct: 40,
        gatilhos_observaveis: ["Focus estável"],
        vencedores: ["DI curto"],
        perdedores: ["duration longa"],
        operacao_preferida: "neutro",
        hedge: "ouro",
        sinal_confirmacao: "IPCA no consenso",
        sinal_invalidacao: "IPCA bem acima",
      },
      {
        nome: "bull",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["corte Fed"],
        vencedores: ["RV"],
        perdedores: ["USD"],
        operacao_preferida: "long IBOV",
        hedge: "put",
        sinal_confirmacao: "VIX < 15",
        sinal_invalidacao: "VIX > 25",
      },
      {
        nome: "bear",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["fiscal BR"],
        vencedores: ["USD"],
        perdedores: ["NTN-B longa"],
        operacao_preferida: "long USD",
        hedge: "caixa",
        sinal_confirmacao: "CDS sobe",
        sinal_invalidacao: "CDS cai",
      },
      {
        nome: "cisne_cinza",
        probabilidade_pct: 10,
        gatilhos_observaveis: ["geopolítica"],
        vencedores: ["ouro"],
        perdedores: ["beta"],
        operacao_preferida: "long vol",
        hedge: "caixa",
        sinal_confirmacao: "spike vol",
        sinal_invalidacao: "vol colapsa",
      },
    ],
    rastreabilidade: {
      fatos_verificados: ["SELIC_META=15 no snapshot"],
      interpretacoes: ["regime de transição"],
      hipoteses: ["fluxo pode reverter"],
      dados_incompletos: ["N/D — vol implícita"],
    },
  });
}

describe("strategist closed-book + gates", () => {
  it("parse + seal + gates ok com claim correto", async () => {
    const result = await runStrategist({
      snapshot,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validMockJson(15),
    });
    expect(result.trades).toHaveLength(1);
    const gates = runGates({
      snapshot,
      claims: result.claims,
      trades: result.trades,
    });
    expect(gates.crossCheck.ok).toBe(true);
    const { published } = filterPublishableTrades(result.trades, true);
    expect(published).toHaveLength(1);

    const mc = buildMorningCall({
      runId: RUN,
      tradeDate: "2026-07-15",
      generatedAt: "2026-07-15T10:00:00.000Z",
      raw: result.raw,
      trades: published,
      provenance: result.provenance,
    });
    const v = validateMorningCall(mc);
    expect(v.aprovado).toBe(true);
  });

  it("número inventado (Selic 1.50) barrado no crossCheck", async () => {
    const result = await runStrategist({
      snapshot,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validMockJson(1.5),
    });
    const gates = runGates({
      snapshot,
      claims: result.claims,
      trades: result.trades,
    });
    expect(gates.crossCheck.ok).toBe(false);
    expect(gates.crossCheck.violations.some((v) => v.kind === "valor_divergente")).toBe(true);
    const { published, rejected } = filterPublishableTrades(result.trades, false);
    expect(published).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("parseStrategistContent rejeita JSON inválido de schema", () => {
    expect(() => parseStrategistContent("{}")).toThrow();
  });

  it("sealStrategistTrades deriva risco_retorno", () => {
    const raw = parseStrategistContent(validMockJson(15));
    const sealed = sealStrategistTrades(raw, {
      run_id: RUN,
      model: "mock",
      prompt_version: "t",
      generated_at: "2026-07-15T10:00:00.000Z",
    });
    expect(sealed[0]!.risco_retorno.value).toBeCloseTo(3, 12);
  });
});

/**
 * Regressão do defeito medido em produção: entre 2026-07-16 e 2026-08-06 o prompt v2 carregava um
 * exemplo realista completo e o modelo devolvia o exemplo, não análise. Oito rodadas gravaram
 * "Compra de Ibovespa futuro" com risco_retorno 1.3043478260869565 idêntico, e os quatro cenários
 * saíam palavra por palavra iguais aos do prompt. Nada acusou por três semanas.
 */
describe("eco do prompt", () => {
  it("o system prompt não contém mais conteúdo de mercado plausível", () => {
    const prompt = buildStrategistSystemPrompt();
    for (const vazamento of [
      "Compra de Ibovespa futuro",
      "put IBOV OTM",
      "132000",
      "14.25",
      "5.07",
      "Fed em compasso de espera",
      "fiscal nao piora antes de outubro",
    ]) {
      expect(prompt).not.toContain(vazamento);
    }
    // O esqueleto continua ensinando a forma.
    expect(prompt).toContain("cenarios");
    expect(prompt).toContain("cisne_cinza");
    expect(prompt).toContain("<<");
  });

  it("inclui o JSON Schema só quando pedido (caminho DeepSeek)", () => {
    expect(buildStrategistSystemPrompt()).not.toContain("JSON Schema");
    const comSchema = buildStrategistSystemPrompt({ incluirSchema: true });
    expect(comSchema).toContain("JSON Schema");
    expect(comSchema).toContain("sizing_pct_orcamento_risco");
  });

  it("saída própria não acusa eco", () => {
    const raw = parseStrategistContent(validMockJson(15));
    expect(detectPromptEcho(raw)).toEqual([]);
  });

  it("placeholder do esqueleto vazado reprova", () => {
    const raw = parseStrategistContent(validMockJson(15));
    raw.abertura.tensao_macro_dominante = "<<tensão macro dominante do dia, 20+ caracteres>>";
    const motivos = detectPromptEcho(raw);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("placeholder do esqueleto");
  });

  it("frase longa verbatim do prompt v2 reprova sozinha", () => {
    const raw = parseStrategistContent(validMockJson(15));
    raw.trades[0]!.tese =
      "Ibovespa descontado frente aos pares emergentes com expectativa de corte de juros no curto prazo";
    expect(detectPromptEcho(raw).some((m) => m.includes("verbatim"))).toBe(true);
  });

  it("acento não escapa da detecção, e três trechos curtos acumulam", () => {
    const raw = parseStrategistContent(validMockJson(15));
    // Em produção o modelo devolvia "fiscal não piora" onde o prompt trazia "fiscal nao piora", e
    // "dólar" onde o prompt trazia "dolar". Comparação crua deixaria os dois passarem.
    raw.rastreabilidade.hipoteses = ["fiscal não piora antes de outubro"];
    raw.rastreabilidade.dados_incompletos = ["fluxo estrangeiro na B3 de julho"];
    raw.cenarios[0]!.gatilhos_observaveis = ["IPCA dentro do esperado"];
    const motivos = detectPromptEcho(raw);
    expect(motivos.some((m) => m.includes("trechos curtos"))).toBe(true);
  });

  it("uma frase curta isolada não reprova — hedge legítimo existe", () => {
    const raw = parseStrategistContent(validMockJson(15));
    raw.cenarios[0]!.hedge = "put IBOV OTM";
    expect(detectPromptEcho(raw)).toEqual([]);
  });

  it("runStrategist devolve o diagnóstico de eco junto do resultado", async () => {
    const result = await runStrategist({
      snapshot,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validMockJson(15),
    });
    expect(result.echo).toEqual([]);
  });
});

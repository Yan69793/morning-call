import { describe, expect, it } from "vitest";
import { renderMorningCallMarkdown } from "../../src/report/markdown.js";
import { buildMorningCall } from "../../src/report/build.js";
import { parseStrategistContent, sealStrategistTrades } from "../../src/agents/strategist.js";
import type { Provenance } from "../../src/schemas/common.js";

const RUN = "11111111-2222-4333-8444-555555555555";
const rationale = "Premissa operacional com mais de vinte caracteres para passar o schema.";

const provenance: Provenance = {
  run_id: RUN,
  model: "deepseek-chat",
  prompt_version: "strategist@2026-08-06-v3",
  generated_at: "2026-08-06T09:31:00.000Z",
};

function rawFixture() {
  return parseStrategistContent(
    JSON.stringify({
      abertura: {
        tensao_macro_dominante: rationale,
        regime: "transicao",
        vies: "neutro",
        conviccao: 5,
        premissa_que_sustenta_precos: rationale,
        fato_que_quebraria: rationale,
      },
      quant_claims: [],
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
          invalidacao: { descricao: rationale, nivel: { value: 4.95, unit: "BRL_por_USD" } },
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
      cenarios: ["base", "bull", "bear", "cisne_cinza"].map((nome, i) => ({
        nome,
        probabilidade_pct: [40, 25, 25, 10][i],
        gatilhos_observaveis: ["gatilho"],
        vencedores: ["ativo"],
        perdedores: ["outro"],
        operacao_preferida: "op",
        hedge: "hedge",
        sinal_confirmacao: "confirma",
        sinal_invalidacao: "invalida",
      })),
      rastreabilidade: {
        fatos_verificados: ["USDBRL=5.07 no snapshot"],
        interpretacoes: [],
        hipoteses: [],
        dados_incompletos: ["N/D — vol implícita"],
      },
    }),
  );
}

function montar(comTrades: boolean) {
  const raw = rawFixture();
  const trades = comTrades ? sealStrategistTrades(raw, provenance) : [];
  return buildMorningCall({
    runId: RUN,
    tradeDate: "2026-08-06",
    generatedAt: "2026-08-06T09:31:00.000Z",
    raw,
    trades,
    provenance,
  });
}

describe("renderMorningCallMarkdown", () => {
  it("cabeçalho traz data, regime e viés", () => {
    const md = renderMorningCallMarkdown(montar(true));
    expect(md).toContain("# Morning Call — 2026-08-06");
    expect(md).toContain("regime **transicao**");
    expect(md).toContain("viés **neutro**");
  });

  it("com trade, rende a tabela e o risco-retorno derivado", () => {
    const md = renderMorningCallMarkdown(montar(true));
    expect(md).toContain("1. Long USD/BRL tático");
    expect(md).toContain("| risco-retorno | 3.00 |");
    expect(md).toContain("5.25 BRL_por_USD");
  });

  /**
   * Zero trade é resultado legítimo, e foi o resultado real de todas as 15 rodadas até 2026-08-06.
   * O arquivo precisa dizer isso e mostrar o motivo, senão parece relatório truncado.
   */
  it("sem trade, diz que não operar é a operação e mostra os motivos do comitê", () => {
    const md = renderMorningCallMarkdown(montar(false), {
      gateReasons: ["trade Compra de Ibovespa futuro: risco_retorno 1.30 < 1.5"],
      aprovado: false,
    });
    expect(md).toContain("Não operar é a operação do dia.");
    expect(md).toContain("risco_retorno 1.30 < 1.5");
    expect(md).toContain("aprovado (validação + gates): não");
  });

  it("cenários viram tabela com as quatro linhas", () => {
    const md = renderMorningCallMarkdown(montar(true));
    for (const nome of ["base", "bull", "bear", "cisne_cinza"]) {
      expect(md).toContain(`| ${nome} |`);
    }
  });

  it("procedência carrega modelo e versão do prompt", () => {
    const md = renderMorningCallMarkdown(montar(true));
    expect(md).toContain("`deepseek-chat`");
    expect(md).toContain("`strategist@2026-08-06-v3`");
  });
});

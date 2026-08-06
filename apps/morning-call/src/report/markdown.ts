/**
 * Renderização do MorningCall para markdown legível.
 *
 * Função pura de propósito: o Worker não escreve em disco, então quem arquiva é um script local
 * (`scripts/save-morning-call.ts`). Deixar a formatação aqui, testada, evita que o renderizador
 * vire lógica não coberta dentro de um script de automação.
 */
import type { MorningCall } from "../schemas/report.js";
import type { Entry, TradeCard } from "../schemas/trade.js";
import type { Quantity } from "../schemas/common.js";

export interface MarkdownExtras {
  /** Motivos que barraram trades no comitê. Sem isso, "0 operações" fica sem explicação. */
  gateReasons?: string[];
  /** `validation.aprovado && gates.ok` como gravado no D1. */
  aprovado?: boolean;
}

function q(x: Quantity): string {
  return `${x.value} ${x.unit}`;
}

function lista(itens: readonly string[]): string {
  if (itens.length === 0) return "_nada registrado_\n";
  return itens.map((i) => `- ${i}`).join("\n") + "\n";
}

/**
 * `entrada` é união discriminada por forma de entrada (AD-6), então não existe "o instrumento"
 * genérico: o ramo `preco` tem um, os ramos `spread` e `premio` têm pernas. Descrever cada ramo
 * pelo que ele de fato carrega evita inventar um campo comum que o contrato não tem.
 */
function descreverEntrada(e: Entry): string {
  switch (e.tipo) {
    case "preco":
      return `${e.instrumento} a ${q(e.nivel)} (faixa ${q(e.faixa.min)} a ${q(e.faixa.max)})`;
    case "spread": {
      const pernas = e.pernas.map((p) => `${p.lado} ${p.instrumento} (peso ${p.peso})`).join(" / ");
      return `spread a ${q(e.nivel)} — ${pernas}`;
    }
    case "premio": {
      const pernas = e.pernas
        .map((p) => `${p.lado} ${p.tipo} ${p.instrumento} strike ${q(p.strike)} venc. ${p.vencimento}`)
        .join(" / ");
      return `prêmio de ${q(e.nivel)} — ${pernas}`;
    }
  }
}

function renderTrade(t: TradeCard, posicao: number): string {
  const d = t.draft;
  const linhas = [
    `### ${posicao}. ${d.nome}`,
    "",
    `${d.classe} · ${d.categoria} · ${d.horizonte} · **${d.direcao}**`,
    "",
    `| campo | valor |`,
    `| --- | --- |`,
    `| entrada | ${descreverEntrada(d.entrada)} |`,
    `| alvo 1 | ${q(d.alvo_1)} |`,
    `| alvo 2 | ${q(d.alvo_2)} |`,
    `| invalidação | ${d.invalidacao.nivel ? q(d.invalidacao.nivel) : "sem nível"} |`,
    `| risco-retorno | ${t.risco_retorno.value.toFixed(2)} |`,
    `| convicção | ${d.conviccao}/10 |`,
    `| sizing | ${d.sizing_pct_orcamento_risco}% do orçamento de risco |`,
    "",
    `**Tese.** ${d.tese}`,
    "",
    `**Erro de precificação.** ${d.erro_precificacao}`,
    "",
    `**Catalisador.** ${d.catalisador}`,
    "",
    `**Por que agora.** ${d.por_que_agora}`,
    "",
    `**Por que não é consenso.** ${d.por_que_nao_consensual}`,
    "",
    `**Riscos ocultos.** ${d.riscos_ocultos}`,
    "",
    `**Invalidação.** ${d.invalidacao.descricao}`,
    "",
    `**Plano de saída.** ${d.plano_saida}`,
    "",
    `**Estrutura alternativa.** ${d.estrutura_alternativa}`,
    "",
    `**Correlação com as outras.** ${d.correlacao_com_outras}`,
    "",
    `Fontes: ${d.fontes.join(", ")}`,
  ];
  return linhas.join("\n");
}

export function renderMorningCallMarkdown(mc: MorningCall, extras: MarkdownExtras = {}): string {
  const a = mc.abertura;
  const partes: string[] = [];

  partes.push(`# Morning Call — ${mc.trade_date}`);
  partes.push("");
  partes.push(
    `Gerado em ${mc.generated_at} · regime **${a.regime}** · viés **${a.vies}** · convicção ${a.conviccao}/10`,
  );
  partes.push("");

  partes.push("## Abertura");
  partes.push("");
  partes.push(`**Tensão macro dominante.** ${a.tensao_macro_dominante}`);
  partes.push("");
  partes.push(`**Premissa que sustenta os preços.** ${a.premissa_que_sustenta_precos}`);
  partes.push("");
  partes.push(`**Fato que quebraria a premissa.** ${a.fato_que_quebraria}`);
  partes.push("");

  partes.push("## Operações");
  partes.push("");
  if (mc.trades.length === 0) {
    // Zero trade é resultado legítimo (schemas/report.ts §11), não falha. O relatório precisa dizer
    // isso com todas as letras, senão um arquivo sem seção de trade parece truncado.
    partes.push("Nenhuma operação passou os gates do comitê. Não operar é a operação do dia.");
    partes.push("");
    if (extras.gateReasons && extras.gateReasons.length > 0) {
      partes.push("Motivos:");
      partes.push("");
      partes.push(lista(extras.gateReasons));
    }
  } else {
    const ordenados = mc.ranking.length === mc.trades.length ? mc.ranking : mc.trades.map((_, i) => i);
    ordenados.forEach((idx, pos) => {
      const t = mc.trades[idx];
      if (!t) return;
      partes.push(renderTrade(t, pos + 1));
      partes.push("");
    });
    if (extras.gateReasons && extras.gateReasons.length > 0) {
      partes.push("### Barrados pelo comitê");
      partes.push("");
      partes.push(lista(extras.gateReasons));
    }
  }

  partes.push("## Cenários");
  partes.push("");
  partes.push("| cenário | prob. | gatilhos | ganha | perde | operação | hedge |");
  partes.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of mc.cenarios) {
    partes.push(
      `| ${c.nome} | ${c.probabilidade_pct}% | ${c.gatilhos_observaveis.join("; ")} | ${c.vencedores.join(", ")} | ${c.perdedores.join(", ")} | ${c.operacao_preferida} | ${c.hedge} |`,
    );
  }
  partes.push("");
  for (const c of mc.cenarios) {
    partes.push(`- **${c.nome}** confirma com "${c.sinal_confirmacao}", invalida com "${c.sinal_invalidacao}".`);
  }
  partes.push("");

  partes.push("## Rastreabilidade");
  partes.push("");
  partes.push("**Fatos verificados**");
  partes.push("");
  partes.push(lista(mc.rastreabilidade.fatos_verificados));
  partes.push("**Interpretações**");
  partes.push("");
  partes.push(lista(mc.rastreabilidade.interpretacoes));
  partes.push("**Hipóteses**");
  partes.push("");
  partes.push(lista(mc.rastreabilidade.hipoteses));
  partes.push("**Dados incompletos**");
  partes.push("");
  partes.push(lista(mc.rastreabilidade.dados_incompletos));

  partes.push("## Procedência");
  partes.push("");
  partes.push(`- run: \`${mc.provenance.run_id}\``);
  partes.push(`- modelo: \`${mc.provenance.model}\``);
  partes.push(`- prompt: \`${mc.provenance.prompt_version}\``);
  if (extras.aprovado !== undefined) {
    partes.push(`- aprovado (validação + gates): ${extras.aprovado ? "sim" : "não"}`);
  }
  partes.push("");

  partes.push("---");
  partes.push("");
  partes.push(`_${mc.disclaimer}_`);
  partes.push("");

  return partes.join("\n");
}

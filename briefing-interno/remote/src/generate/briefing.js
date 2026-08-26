// generate/briefing.js — porta de gerar_briefing.py (prompt + OpenRouter).
//
// SYSTEM_PROMPT e _build_user_prompt copiados byte a byte do Python
// (paridade testada por snapshot em tests/prompt.equiv.test.mjs). O sufixo
// :online do OpenRouter esta DESATIVADO desde 18/08/2026 (fix 075a806):
// web search e incompativel por construcao com a REGRA 1 do validador.
// Nao reativar sem mudar a REGRA 1.

import { ATIVOS_META } from "../collect/precos.js";
import { UA } from "../collect/noticias.js";

export const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";
export const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const SYSTEM_PROMPT = `Voce e um analista de mercado senior escrevendo um briefing matinal interno para um gestor de portfolio multi-projeto.

REGRAS ABSOLUTAS:
1. Toda chamada direcional ("tende a subir", "deve cair", "vai valorizar") PRECISA citar fonte_url.
   A fonte_url TEM que estar no pool de noticias fornecido. Fonte fora do pool e alucinacao.
   Copie a URL EXATAMENTE como esta no pool, caractere por caractere, mantendo https://,
   o dominio original e o final do caminho. Nao encurte, nao troque dominio, nao invente
   extensao (.ghtml). URL errada e pior que nenhuma URL.
2. Toda chamada direcional PRECISA declarar confianca entre 0.0 e 1.0, no formato EXATO
   "confianca: X.X" (a palavra confianca, dois pontos, espaco, numero com ponto decimal),
   entre parenteses logo apos a frase direcional, por exemplo "(confianca: 0.7)". O validador
   so reconhece esse formato literal, prosa como "com uma confianca de 0.7" ou "confianca
   de 0.7" NAO conta e reprova o briefing inteiro.
   confianca alta (0.7+) = multiplas fontes confirmam. confianca baixa (0.3-) = fonte unica ou correlacao incerta.
3. NUNCA cite um projeto que nao esta na lista de projetos fornecida.
   NUNCA cite um projeto com exposicao vazia ([]). Esses projetos NAO TEM relacao com mercado.
   NUNCA cite Morning Call nem Radar Quant como projetos: em 13/08 o Yan tirou
   as secoes de dados dos dois do briefing, e a leitura por projeto deles tambem saiu.
4. Briefing sem nenhuma chamada direcional e invalido. Encontre pelo menos uma leitura relevante.
5. Todo nivel de mercado citado PRECISA sair com o numero EXATO, a unidade e
   as casas da tabela COTACOES do prompt ("a 174.577 pontos", "R$ 5,1625",
   "US$ 82,36", "14,00% a.a."). NUNCA copie o numero cru com ponto decimal
   ("174577.0"), nunca cite nivel sem unidade e nunca use virgula como
   separador de milhar ("174,577" e 1000x menor e reprova o briefing).

FORMATO DO BRIEFING (HTML):
- Gere apenas o MIDLO do briefing, em HTML minimo de conteudo, SEM casca de
  documento. Nao use <html>, <head>, <body>, <style>, <script>, comentario,
  doctype, tabela ou qualquer atributo de apresentacao (style, class, id).
- Use apenas estas tags estruturais: <h2> para titulo de secao,
  <p> para paragrafo, <li> para item de lista, <b> para enfase, <a> para link
  de fonte. NAO use <h1>: o <h1> e reservado ao cabecalho do e-mail. Nao
  invente <h1> nem outro nivel de cabecalho.
- Estrutura limpa, self-contained no conteudo. Formato dos bancos globais
  (pesquisado em 13/08 no Deutsche Bank, Bloomberg e
  Goldman): poucos blocos, cada um com titulo em negrito, 2-3 frases densas em
  numero exato com comparacao historica ("melhor semana desde 2008"), e a ultima
  frase diz por que importa para o mercado. Sem lista de recomendacao, sem secao
  de ferramentas, sem projetos internos.
- Secoes:
  1. RESUMO — 2-3 frases com o fechamento dos mercados e o quadro do dia.
  2. O QUE IMPORTA HOJE — 3 a 5 pontos numerados. Cada ponto comeca com
     <b>Titulo do evento ou movimento.</b> Em seguida 2-3 frases com numeros
     exatos e comparacao historica, e a ultima frase diz por que importa
     (efeito em preco, taxa, spread ou dolar). A chamada direcional fica
     embutida na prosa, com fonte_url e confianca no formato exato da REGRA 2
     ("confianca: X.X"), nunca como recomendacao de compra ou venda. OBRIGATORIO: cada
     ponto precisa de pelo
     menos uma frase com leitura direcional explicita no padrao "tende a
     subir/cair", "deve pressionar", "vies de alta/baixa" ou "pressao de
     alta/baixa", porque o validador reprova briefing sem chamada direcional.
     A fonte vai como link <a href="URL">Fonte: Veiculo</a> no fim do ponto.
  3. AGENDA DO DIA — Somente os eventos do bloco AGENDA DO DIA fornecido no
     prompt, com horario e fonte. Se o bloco disser que nao ha evento
     confirmado, escreva "Sem eventos de agenda confirmados para hoje".
     NUNCA invente evento de agenda, nem recupere de memoria.

TON: direto, analitico, sem firula. Nao e relatorio institucional, e briefing interno.
Nao use marcadores de IA ("vale notar que", "pode-se argumentar"). Vá direto ao ponto.
Separe frases com virgula e ponto. Nunca use travessao.
Portugues BR. Sem recomendacao de investimento.`;

// blocoAgenda: porta de _bloco_agenda (gerar_briefing.py L118-138).
// agendaStatus "degradado" (IBGE falhou na coleta remota) adiciona uma linha
// explicita de fonte parcial, sem inventar evento.
export function blocoAgenda(payload, dataTag, agendaStatus) {
  const linhas = [];
  if (payload) {
    const hoje = `${dataTag.slice(0, 4)}-${dataTag.slice(4, 6)}-${dataTag.slice(6, 8)}`;
    const eventos = (payload.eventos || []).filter((e) => e.data === hoje);
    eventos.sort((a, b) => {
      const ha = a.hora_brt || "";
      const hb = b.hora_brt || "";
      if (ha !== hb) return ha < hb ? -1 : 1;
      const ea = a.evento || "";
      const eb = b.evento || "";
      return ea < eb ? -1 : ea > eb ? 1 : 0;
    });
    for (const e of eventos) {
      const hora = e.hora_brt || "";
      linhas.push(
        `- ${hora} (${e.regiao ?? "?"}): ${e.evento ?? "?"} ` +
          `[${e.fonte ?? "?"}]`,
      );
    }
  }
  if (!linhas.length) {
    linhas.push(
      "- NENHUM evento confirmado para hoje na fonte oficial da casa. " +
        "Escreva 'Sem eventos de agenda confirmados para hoje' e nao invente.",
    );
  }
  if (agendaStatus === "degradado") {
    linhas.push(
      "- FONTE PARCIAL: o calendario do IBGE falhou na coleta remota; a lista acima so tem " +
        "eventos de calendarios oficiais fixos. NAO complete com eventos de memoria.",
    );
  }
  return (
    "=== AGENDA DO DIA (dados oficiais, use SOMENTE estes eventos) ===\n" +
    linhas.join("\n")
  );
}

// pyFmt: o f-string do Python renderiza booleano como True/False; o template
// literal do JS renderiza true/false. Ajuste obrigatorio para paridade.
function pyFmt(v) {
  if (typeof v === "boolean") return v ? "True" : "False";
  return v;
}

// pyStr: replica a stringificacao de float do Python (str(float)).
// `str(171032.0)` = "171032.0", mas `String(171032)` no JS = "171032" (omite
// o .0). Desde 26/08/2026 o bloco COTACOES usa fmtNivel (nivel formatado), e
// o pyStr ficou so para o ramo YAHOO FALLBACK do Radar Quant abaixo, que o
// Python imprime com str(). Cobre inteiros float-like e floats fracionarios.
function pyStr(v) {
  if (v === null || v === undefined) return String(v);
  const n = Number(v);
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}

// fmtNumBR: porta de _fmt_num_br (gerar_briefing.py). Ponto separa milhar,
// virgula separa decimal, zeros a direita mantidos quando a casa exige.
// O arredondamento e o toFixed direto, sem pyRound: multiplicar por 10^d
// antes de arredondar introduce uma segunda rodada de erro de float
// (2.675*100 da 267.5 EXATO no JS e vira "2.68" no pyRound, quando o Python
// ve 2.6749999... e emite "2.67"). O toFixed arredonda o MESMO double que o
// f-string do Python, e os vetores compartilhados fmt_vectors.json prendem a
// saida identica. Nunca produz virgula de milhar ("174,577").
export function fmtNumBR(valor, dec) {
  const s = Number(valor).toFixed(dec);
  const [inteiro, resto] = s.split(".");
  const gru = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto ? `${gru},${resto}` : gru;
}

// fmtNivel: porta de _fmt_nivel (gerar_briefing.py). display_unit vazio
// (ativo desconhecido) devolve so o numero. Moeda antes ("R$ 5,1625"), as
// demais unidades depois ("174.577 pontos", "14,00% a.a.").
export function fmtNivel(ticker, valor) {
  const meta = ATIVOS_META[ticker] || {};
  const unit = meta.display_unit || "";
  const base = fmtNumBR(valor, meta.display_decimals ?? 0);
  if (!unit) return base;
  if (unit === "R$" || unit === "US$") return `${unit} ${base}`;
  if (unit.startsWith("%")) return `${base}${unit}`; // "% a.a." cola no numero
  return `${base} ${unit}`;
}

// blocoPrecos: porta de _bloco_precos (gerar_briefing.py L150-184). Injeta a
// cotacao de fechamento no prompt SEMPRE, nao so em fallback. Sem ativos, o
// bloco manda o modelo NAO citar nivel — e a REGRA 6 reprova se citar.
export function blocoPrecos(precos) {
  const ativos = precos?.ativos || {};
  const entradas = Object.keys(ativos);
  if (!entradas.length) {
    return (
      "=== COTACOES ===\n" +
      "INDISPONIVEL. Nao cite nivel, cotacao ou pontuacao de nenhum ativo " +
      "neste briefing. Fale de direcao e de causa, sem numero de mercado."
    );
  }

  const linhas = ["=== COTACOES (fechamento do ultimo pregao encerrado) ==="];
  linhas.push(
    "Use EXATAMENTE estes numeros ao citar nivel de mercado, no formato da " +
      "tabela (unidade e casas ja aplicadas, ex.: '174.577 pontos', " +
      "'R$ 5,1625', 'US$ 82,36', '14,00% a.a.'). Nao arredonde para valor " +
      "diferente, nao complete de memoria, nao cite ativo que nao esteja " +
      "nesta lista. Nunca use numero cru ('174577.0') nem virgula de milhar " +
      "('174,577', que e 1000x menor). O portao de validacao confere cada " +
      "nivel citado contra esta tabela e reprova o briefing fora da " +
      "tolerancia.",
  );
  for (const ticker of entradas) {
    const d = ativos[ticker];
    const varNum = d.change_percent;
    let varTxt = "";
    if (typeof varNum === "number") {
      // f"{var:+.2f}%" do Python: sinal explicito e 2 casas.
      varTxt = `, var ${varNum >= 0 ? "+" : ""}${varNum.toFixed(2)}%`;
    }
    const close = d.close;
    const nivel =
      typeof close === "number" && Number.isFinite(close)
        ? fmtNivel(ticker, close)
        : "n/d";
    linhas.push(
      `  ${ticker}: ${nivel} (pregao ${d.trade_date}${varTxt}) [${d.fonte || "n/d"}]`,
    );
  }
  const erros = precos?.erros || [];
  if (erros.length) {
    linhas.push(`  Ativos sem cotacao nesta coleta: ${erros.length}. Nao cite nivel deles.`);
  }
  return linhas.join("\n");
}

// buildUserPrompt: porta de _build_user_prompt, byte a byte na ordem e no
// conteudo (o snapshot de paridade em tests/ prende isso). `precos` injeta o
// bloco COTACOES logo apos a DATA, na mesma ordem do Python (gerada sobre
// precos_<data>.json real, nunca o ramo INDISPONIVEL dos dias sem coleta).
export function buildUserPrompt(noticias, estado, exposicao, dataTag, agendaPayload, agendaStatus, precos) {
  const partes = [];

  partes.push(`DATA: ${dataTag}`);
  partes.push("");

  partes.push(blocoPrecos(precos));
  partes.push("");

  const itens = noticias.itens || [];
  partes.push(`=== NOTICIAS DO DIA (${itens.length} itens) ===`);
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    partes.push(`[${i}] ${item.title}`);
    partes.push(`    Fonte: ${item.source} | URL: ${item.url}`);
    if (item.published) {
      partes.push(`    Data: ${item.published}`);
    }
    partes.push("");
  }

  partes.push(blocoAgenda(agendaPayload, dataTag, agendaStatus));
  partes.push("");

  const sistemas = estado.sistemas || {};

  const mc = sistemas["morning-call"] || {};
  if (mc.ok) {
    partes.push("=== MORNING CALL ===");
    partes.push(`Trade date: ${mc.trade_date}`);
    partes.push(`Regime: ${mc.regime}`);
    partes.push(`Vies: ${mc.vies}`);
    partes.push(`Conviccao: ${mc.conviccao}/10`);
    partes.push(`N trades: ${mc.n_trades}`);
    partes.push(`Aprovado: ${pyFmt(mc.aprovado)}`);
    partes.push("");
  }

  const rq = sistemas["radar-quant"] || {};
  if (rq.ok) {
    const staleness = rq.staleness || {};
    partes.push("=== RADAR QUANT ===");
    partes.push(`Market date: ${staleness.market_date}`);
    partes.push(`Stale: ${pyFmt(staleness.stale)}`);
    partes.push(`Dias atraso: ${staleness.dias_atraso}`);
    partes.push(`Dias consecutivos: ${staleness.dias_consecutivos ?? 0}`);
    partes.push(`N items: ${rq.n_items ?? 0}`);
    const yahoo = rq.yahoo_fallback || {};
    if (yahoo.acionado) {
      partes.push("YAHOO FALLBACK ACIONADO (scan fora do ar):");
      for (const [ticker, d] of Object.entries(yahoo.dados || {})) {
        partes.push(
          `  ${ticker}: ${pyStr(d.price)} ` +
            `(var: ${pyStr(d.changePercent)}%) ` +
            `[${d.fonte ?? "Yahoo"}]`,
        );
      }
    }
    partes.push("");
  }

  const vx = sistemas["vixradar"] || {};
  if (vx.ok) {
    partes.push("=== VIXRADAR ===");
    partes.push(`Status: ${vx.status ?? "?"}`);
    partes.push("");
  }

  partes.push("=== PROJETOS COM EXPOSICAO A MERCADO ===");
  for (const proj of Object.values(exposicao || {})) {
    const exp = proj.exposicao || [];
    if (!exp.length) continue;
    partes.push(`- ${proj.nome}: ${exp.join(", ")}`);
    partes.push(`  Por que: ${proj.porque}`);
  }
  partes.push("");

  partes.push("=== PROJETOS SEM EXPOSICAO (NAO CITAR NO BRIEFING) ===");
  for (const proj of Object.values(exposicao || {})) {
    const exp = proj.exposicao || [];
    if (exp.length) continue;
    partes.push(`- ${proj.nome}`);
  }

  partes.push("");
  partes.push("INSTRUCAO: Gere o briefing matinal em HTML self-contained.");
  partes.push("Inclua chamadas direcionais com fonte_url e confianca no formato exato 'confianca: X.X' entre parenteses (ex.: (confianca: 0.7)).");
  partes.push("NAO cite projetos com exposicao vazia.");
  partes.push("Se Radar Quant stale >= 2 dias consecutivos, suprima a secao e reporte a indisponibilidade.");
  partes.push("Retorne APENAS o HTML, sem texto antes ou depois.");

  return partes.join("\n");
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const f = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await f(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// callOpenrouter: porta de _call_openrouter + _json_or_runtime. Todo erro vira
// excecao para a cadeia de modelos avancar (F05/T01 preservados).
export async function callOpenrouter({ apiKey, model, systemPrompt, userPrompt, openrouterUrl, fetchImpl }) {
  const url = openrouterUrl || DEFAULT_OPENROUTER_URL;
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2048,
  });

  let resp;
  try {
    resp = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://szuchmacher.com.br",
          "X-Title": "Briefing Matinal v1",
          "User-Agent": UA,
        },
        body,
      },
      180000,
      fetchImpl,
    );
  } catch (exc) {
    throw new Error(`OpenRouter rede/timeout: ${exc}`, { cause: exc });
  }

  if (!resp.ok) {
    let corpo = "(corpo indisponivel)";
    try {
      corpo = (await resp.text()).slice(0, 500);
    } catch {
      /* mantem o placeholder */
    }
    throw new Error(`OpenRouter HTTP ${resp.status}: ${corpo}`);
  }

  let data;
  try {
    data = await resp.json();
  } catch (exc) {
    throw new Error(`OpenRouter resposta nao-JSON: ${exc}`, { cause: exc });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`OpenRouter resposta com shape inesperado: ${Array.isArray(data) ? "list" : typeof data}`);
  }

  let content;
  try {
    content = data.choices[0].message.content;
  } catch (exc) {
    throw new Error(`OpenRouter resposta inesperada: ${exc}`, { cause: exc });
  }
  if (!content || typeof content !== "string") {
    const finishReason = (data.choices || [{}])[0].finish_reason || "desconhecido";
    throw new Error(`OpenRouter conteudo vazio ou nulo (finish_reason=${finishReason})`);
  }

  // Remove markdown fence se houver (mesma sequencia do Python).
  content = content.trim();
  content = content.replace(/^```(?:html)?\s*/, "");
  content = content.replace(/\s*```$/, "");
  return content;
}

// Portable tree-walk sanitizer of the LLM output (porta de
// scripts/_sanitizar_briefing.py). Devolve os proprios textos (h1->h2, so
// tags h2/p/li/ul/ol/b/strong/a/br, sem atributo, href so http/https, e
// script/style descartados com o conteudo). Semantica alinhada ao Python;
// nao aspira a byte a byte (paridade funcional, ajuste 3).
const TAGS_ALLOWED = new Set(["h2", "p", "li", "ul", "ol", "b", "strong", "a", "br"]);
const TAGS_DESCARTE = new Set(["script", "style"]);

function sanitizeAttrs(attrs) {
  // Vira objeto; retorna {href} so se for http/https. Caso contrario {}.
  const out = {};
  for (const a of attrs) {
    const val = a.value === null || a.value === undefined ? null : String(a.value);
    if (a.name.toLowerCase() === "href" && val) {
      if (/^https?:\/\//i.test(val.trim())) out.href = val.trim();
    }
    // style/class/id/on*/desconhecidos: ignorados (nunca entram em out)
  }
  return out;
}

export function sanitizarConteudo(html) {
  if (!html) return "";
  // remove comentarios, doctype e prolog
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  // remove script/style INTEIROS (conteudo incluido)
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");

  const out = [];
  // pilha de descarte: "tudo" | "tag"
  const pilha = [];
  const emDescarteTudo = () => pilha.includes("tudo");
  const trim = (x) => x.trim();

  const pushText = (data) => {
    if (!emDescarteTudo()) out.push(data);
  };

  // tokenizer simples de tags abertas/fechadas
  const re = /<\/?[a-zA-Z][^>]*>|[^<]+/g;
  for (const tok of s.matchAll(re)) {
    const t = tok[0];
    if (!t.startsWith("<")) {
      pushText(t);
      continue;
    }
    // t é uma tag
    const closing = /^<\//.test(t);
    const body = t.replace(/^<\/?/, "").replace(/\/?>$/, "");
    const m = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(trim(body));
    if (!m) continue;
    let tag = m[1].toLowerCase();
    if (tag === "h1") tag = "h2"; // h1 é do template

    if (TAGS_DESCARTE.has(tag)) {
      if (!closing && !emDescarteTudo()) pilha.push("tudo");
      if (closing) {
        const idx = pilha.lastIndexOf("tudo");
        if (idx >= 0) pilha.splice(idx, 1);
      }
      continue;
    }
    if (closing) {
      if (TAGS_ALLOWED.has(tag) && !emDescarteTudo()) out.push(`</${tag}>`);
      else {
        const idx = pilha.lastIndexOf("tag");
        if (idx >= 0) pilha.splice(idx, 1);
      }
      continue;
    }
    // abertura
    const attrRe = /([a-zA-Z:][a-zA-Z0-9:._-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    const attrs = [];
    let am;
    while ((am = attrRe.exec(body)) !== null) {
      attrs.push({ name: am[1], value: am[2] ?? am[3] ?? am[4] ?? "" });
    }
    const safe = sanitizeAttrs(attrs);
    if (!TAGS_ALLOWED.has(tag)) {
      if (!emDescarteTudo()) pilha.push("tag");
      continue;
    }
    if (emDescarteTudo()) continue; // dentro de script/style nada escapa
    if (tag === "a") {
      out.push(safe.href ? `<a href="${safe.href}">` : "<a>");
    } else if (tag === "br") {
      out.push("<br>");
    } else {
      out.push(`<${tag}>`);
    }
  }
  let res = out.join("");
  res = res.replace(/[ \t\r\f\v]+/g, " ");
  res = res.replace(/\n\s*\n+/g, "\n");
  return res.trim();
}

// geraComCadeia: porta do loop de modelos do main() (primario -> fallback).
// Devolve { html, model } ou lança quando todos falham.
export async function geraComCadeia({ apiKey, models, systemPrompt, userPrompt, openrouterUrl, fetchImpl }) {
  let lastError = null;
  for (const model of models) {
    try {
      const raw = await callOpenrouter({
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        openrouterUrl,
        fetchImpl,
      });
      if (!raw || raw.trim().length < 200) {
        lastError = new Error(`resposta muito curta (${raw ? raw.length : 0} chars)`);
        continue;
      }
      // Sanitiza o conteudo antes de devolver (mesma logica do main() Python).
      const html = sanitizarConteudo(raw);
      if (!html || html.trim().length < 200) {
        lastError = new Error("conteudo vazio apos sanitizacao");
        continue;
      }
      return { html, model };
    } catch (exc) {
      lastError = exc;
    }
  }
  throw new Error(`todos os modelos falharam: ${lastError}`);
}

/**
 * Etapa 1 da cadeia nova (10/09/2026): pesquisa web via OpenRouter.
 *
 * `deepseek/deepseek-v4-flash-0731` com o plugin `web` padrão (Exa). O benchmark de 10/09 mediu
 * o engine Parallel (turbo e basic) devolvendo corpus de março a agosto numa consulta que pedia
 * 24h, então o engine padrão é o único caminho aprovado para esta janela.
 *
 * A proveniência (`message.annotations`) atravessa toda a cadeia: cada fonte carrega url, título,
 * domínio e a janela temporal classificada. Sem isso, o estrategista recebe texto sem rastro.
 */
import { chatCompletion, resolverProvedor, type CitationProvenance, type Provedor } from "./openrouter.js";

/** Consulta única da cadeia. Editar aqui muda research e analyst juntos, por construção. */
export const RESEARCH_QUERY =
  "Pesquise os fatos macroeconômicos, geopolíticos e de mercados publicados nas últimas 24 horas mais relevantes para um Morning Call brasileiro. Priorize Brasil, EUA, Europa, China, juros, inflação, moedas, petróleo, metais, bolsas e eventos geopolíticos com potencial de mover ativos. Não use fatos anteriores à janela salvo contexto indispensável.";

export type Janela = "24h" | "contexto" | "indeterminado";

export interface FontePesquisada extends CitationProvenance {
  /** Data de publicação extraída da URL ou do título, em `YYYY-MM-DD`. `null` = não declarada. */
  data_publicacao: string | null;
  janela: Janela;
}

export interface FreshnessResumo {
  /** >= 1 fonte com data verificável dentro da janela de 24h. */
  ok: boolean;
  naJanela: number;
  contexto: number;
  indeterminado: number;
  total: number;
  motivo: string;
}

export interface ResearchResult {
  ok: boolean;
  motivo?: string;
  fontes: FontePesquisada[];
  conteudo: string;
  modelo: string;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number;
  freshness: FreshnessResumo;
}

/**
 * Custo de busca: o plugin `web` do OpenRouter cobra POR RESULTADO devolvido.
 * Medido em 17/09/2026 com `max_results: 2`: US$ 0,0074 de custo total, dos quais
 * US$ 0,0070 eram busca (US$ 0,0035 por resultado) e US$ 0,0004 eram tokens de LLM.
 * Com o teto antigo de 10, cada rodada gastava ~US$ 0,035 so de busca, e a rodada
 * roda todo dia util as 06:30 BRT: ~US$ 0,75/mes, o item dominante da fatura.
 *
 * Medido tambem em 10/09/2026: com 10 resultados, a pesquisa devolveu 10 citacoes,
 * 10 dominios e apenas 5 fontes dentro da janela de 24h. O portao de freshness exige
 * >= 1 fonte na janela, entao 5 resultados sustentam o gate com folga.
 *
 * Override por ambiente: `RESEARCH_MAX_RESULTS`. Subir de volta para 10 custa
 * ~US$ 0,0175 extras por rodada. Cada resultado a mais e um resultado a mais na
 * fatura, nao um teto.
 */
export const RESEARCH_MAX_RESULTS_PADRAO = 5;

const RE_URL_DATA = [/\/(20\d\d)[/-](\d\d)[/-](\d\d)/, /\b(20\d\d)(\d\d)(\d\d)\b/];
const RE_TITULO_DATA = [/(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)/];

function normalizar(ano: string, mes: string, dia: string): string | null {
  const m = Number(mes);
  const d = Number(dia);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Extrai a data de publicação do que o provedor manda junto: primeiro a URL (a maioria dos
 * veículos põe `/2026/09/09/` ou `20260909` no caminho), depois o título (`09/09/2026`).
 *
 * Contagem de citações não é prova de freshness — foi exatamente o que o benchmark de 10/09
 * mostrou: os testes com Parallel devolveram 10 e 9 citações, todas de meses anteriores.
 */
export function extrairDataPublicacao(url: string, titulo: string): string | null {
  for (const re of RE_URL_DATA) {
    const m = re.exec(url);
    if (m) {
      const r = normalizar(m[1]!, m[2]!, m[3]!);
      if (r) return r;
    }
  }
  for (const re of RE_TITULO_DATA) {
    const m = re.exec(titulo);
    if (m) {
      const r = normalizar(m[3]!, m[2]!, m[1]!);
      if (r) return r;
    }
  }
  return null;
}

export function classificarJanela(data: string | null, agoraIso: string): Janela {
  if (!data) return "indeterminado";
  const limite = new Date(Date.parse(agoraIso) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Comparação lexicográfica basta: `YYYY-MM-DD` ordena igual à data. O limite é a data do
  // instante (agora - 24h), não o dia corrente: uma matéria das 23h de ontem ainda está na janela.
  return data >= limite ? "24h" : "contexto";
}

export function avaliarFreshness(fontes: FontePesquisada[]): FreshnessResumo {
  const naJanela = fontes.filter((f) => f.janela === "24h").length;
  const contexto = fontes.filter((f) => f.janela === "contexto").length;
  const indeterminado = fontes.filter((f) => f.janela === "indeterminado").length;
  return {
    ok: naJanela >= 1,
    naJanela,
    contexto,
    indeterminado,
    total: fontes.length,
    motivo:
      naJanela >= 1
        ? `${naJanela} fonte(s) com data verificável na janela de 24h`
        : `nenhuma fonte com data verificável em 24h (${contexto} de contexto, ${indeterminado} sem data)`,
  };
}

export function classificarFontes(
  citacoes: CitationProvenance[],
  agoraIso: string,
): FontePesquisada[] {
  const vistas = new Set<string>();
  const fontes: FontePesquisada[] = [];
  for (const c of citacoes) {
    if (vistas.has(c.url)) continue;
    vistas.add(c.url);
    const data = extrairDataPublicacao(c.url, c.title);
    fontes.push({ ...c, data_publicacao: data, janela: classificarJanela(data, agoraIso) });
  }
  return fontes;
}

/** Bloco de fontes para o prompt do analyst: rótulo de janela explícito em toda linha. */
export function formatarFontes(fontes: FontePesquisada[]): string {
  if (fontes.length === 0) return "NENHUMA fonte retornada pela pesquisa.";
  return fontes
    .map((f, i) => {
      const selo = f.janela === "24h" ? "24H" : f.janela === "contexto" ? "CONTEXTO" : "SEM-DATA";
      return `[${i + 1}] (${selo}) ${f.title || "(sem título)"} — ${f.url} — domínio ${f.dominio}`;
    })
    .join("\n");
}

export interface RunResearchInput {
  apiKey: string;
  model: string;
  /** Instante de referência da janela. Injetado para o teste não depender do relógio. */
  agoraIso: string;
  maxResults?: number;
  query?: string;
  /** Teto de tokens do resumo. Menor valor aprovado no gate de 10/09/2026. */
  maxTokens?: number;
  /** Esforço de raciocínio. `null` não manda o campo (controle de medição). */
  reasoningEffort?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Provedor da chamada. Ausente = OpenRouter, que e o unico com o plugin `web` de busca. */
  provedor?: Provedor;
  /**
   * @deprecated Apelido de `provedor: "deepseek"`. O caminho DeepSeek nao tem busca, entao usar
   * isto aqui e declarar que a pesquisa vai voltar vazia.
   */
  deepseekApi?: boolean;
}

export async function runResearch(input: RunResearchInput): Promise<ResearchResult> {
  const maxResults = input.maxResults ?? RESEARCH_MAX_RESULTS_PADRAO;
  const query = input.query ?? RESEARCH_QUERY;
  const r = await chatCompletion({
    apiKey: input.apiKey,
    model: input.model,
    provedor: resolverProvedor(input),
    messages: [{ role: "user", content: query }],
    plugins: [{ id: "web", max_results: maxResults }],
    // O resumo é material para o analyst, não produto final: com o raciocínio desligado o teto
    // cobre só o texto. Medido em 10/09/2026: 2500 truncou (tokensOut = teto) e trouxe 4 fontes
    // datadas em 24h; 3500 fechou em 2558 tokens com 10 citações, 10 domínios e 5 fontes em 24h.
    maxTokens: input.maxTokens ?? 3500,
    ...(input.reasoningEffort === null
      ? {}
      : { reasoning: { effort: input.reasoningEffort ?? "none" } }),
    // Busca web passa fácil dos 120s padrão do cliente: medido em 10/09/2026, o research estourou o
    // timeout default e abortou a rodada antes de devolver qualquer citação.
    timeoutMs: input.timeoutMs ?? 240_000,
    fetchFn: input.fetchFn,
  });
  const fontes = classificarFontes(r.citations, input.agoraIso);
  const freshness = avaliarFreshness(fontes);
  return {
    ok: fontes.length > 0,
    motivo: fontes.length > 0 ? undefined : "pesquisa sem citações retornadas pela API",
    fontes,
    conteudo: r.content,
    modelo: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    reasoningTokens: r.reasoningTokens,
    freshness,
  };
}

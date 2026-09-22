/**
 * Segunda sonda, dois assuntos que decidem o resto da configuracao.
 *
 * Parte A, proveniencia. O plugin `web` do OpenRouter devolve `message.annotations[]` com
 * `url_citation`. O `gpt-5-search-api` recusou `json_object` com "not supported with web_search",
 * o que sugere busca ligada por padrao. Se a anotacao vier no mesmo formato, a etapa de research
 * continua com fonte rastreavel. Se nao vier, a rodada sai closed-book e isso fica registrado.
 *
 * Parte B, esforco de raciocinio. O codigo nao manda `reasoning` nenhum para a OpenAI, porque o
 * campo do OpenRouter e outro e nome errado vira 400. Sem controle de esforco, modelo de raciocinio
 * gasta o teto de tokens pensando e devolve corpo truncado, que foi o que a medicao de 10/09/2026
 * pegou no analyst. Se a OpenAI aceitar `reasoning_effort`, o controle volta.
 *
 * Regra de construcao deste arquivo, e a razao de ele ter sido reescrito: sonda que mede formato
 * inesperado nao pode quebrar com formato inesperado. A versao anterior morreu em
 * `JSON.stringify(anotacoes[0]).slice(...)` na primeira resposta real, porque `JSON.stringify` de
 * `undefined` devolve `undefined` e o `.slice` seguinte estoura. Agora toda leitura do corpo passa
 * por guarda de tipo, um modelo problematico nao derruba os outros, e o arquivo de saida e escrito
 * no `finally`, mesmo com falha no meio.
 *
 * Rode a mao:
 *
 *   $env:OPENAI_API_KEY = Read-Host -Prompt "chave"
 *   npx tsx scripts/local/probe-busca-openai.ts
 *   Remove-Item Env:\OPENAI_API_KEY
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const chave = process.env.OPENAI_API_KEY;
if (!chave) {
  console.error("OPENAI_API_KEY ausente no ambiente. Nada foi chamado.");
  process.exit(2);
}

const MODELOS = ["gpt-5-search-api", "gpt-5.4", "gpt-5.4-mini", "gpt-5.6-terra", "gpt-6-astra"];
const URL_CHAT = "https://api.openai.com/v1/chat/completions";
const PERGUNTA_BUSCA =
  "Qual foi o fechamento do indice Ibovespa no ultimo pregao disponivel? " +
  "Responda em uma linha, com a data e a URL da fonte.";

async function chamar(corpo: Record<string, unknown>): Promise<{ status: number; texto: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(URL_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    return { status: res.status, texto: await res.text() };
  } catch (err) {
    return { status: 0, texto: err instanceof Error ? err.message.slice(0, 300) : "erro" };
  } finally {
    clearTimeout(timer);
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : null;
}

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function numeroDe(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function listaDe(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/** Nunca estoura: `JSON.stringify(undefined)` devolve undefined e o `.slice` seguinte quebrava. */
function jsonSeguro(valor: unknown, limite = 600): string {
  try {
    const s: unknown = JSON.stringify(valor);
    if (typeof s !== "string") return `(nao serializavel: ${typeof valor})`;
    return s.length > limite ? `${s.slice(0, limite)}...` : s;
  } catch {
    return "(falha ao serializar)";
  }
}

function lerJson(texto: string): Record<string, unknown> {
  try {
    return objeto(JSON.parse(texto) as unknown) ?? {};
  } catch {
    return {};
  }
}

function mensagemDo(cru: Record<string, unknown>): Record<string, unknown> {
  const primeira = objeto(listaDe(cru.choices)[0]);
  return objeto(primeira?.message) ?? {};
}

interface Busca {
  modelo: string;
  status: number;
  conteudo?: string;
  anotacoes?: number;
  tiposDeAnotacao?: string[];
  exemploAnotacao?: string;
  urlsNoTexto?: number;
  tokensIn?: number;
  tokensOut?: number;
  ms?: number;
  /** Trecho do corpo cru. Guardado quando a resposta sai do contrato esperado. */
  trechoBruto?: string;
  erro?: string;
}

interface Esforco {
  modelo: string;
  esforco: string;
  status: number;
  erro?: string;
  tokensOut?: number;
  conteudo?: string;
}

const busca: Busca[] = [];
const esforco: Esforco[] = [];

try {
  for (const modelo of MODELOS) {
    const inicio = Date.now();
    const r: Busca = { modelo, status: 0 };
    try {
      const { status, texto } = await chamar({
        model: modelo,
        messages: [{ role: "user", content: PERGUNTA_BUSCA }],
        max_completion_tokens: 400,
      });
      r.status = status;
      if (status === 200) {
        const cru = lerJson(texto);
        const msg = mensagemDo(cru);
        const conteudo = textoDe(msg.content);
        const anotacoes = listaDe(msg.annotations);
        r.conteudo = conteudo.slice(0, 400);
        r.anotacoes = anotacoes.length;
        r.tiposDeAnotacao = [
          ...new Set(anotacoes.map((a) => textoDe(objeto(a)?.type) || "sem-type")),
        ];
        // Sem truncar o interior da anotacao: e o formato dela que decide a proxima etapa.
        r.exemploAnotacao = jsonSeguro(anotacoes[0], 2000);
        r.urlsNoTexto = conteudo.match(/https?:\/\//g)?.length ?? 0;
        r.tokensIn = numeroDe(objeto(cru.usage)?.prompt_tokens);
        r.tokensOut = numeroDe(objeto(cru.usage)?.completion_tokens);
        if (anotacoes.length > 0 || conteudo.length === 0) {
          r.trechoBruto = texto.slice(0, 1500);
        }
      } else {
        r.erro = texto.slice(0, 300);
      }
    } catch (err) {
      r.erro = err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido";
    }
    busca.push({ ...r, ms: Date.now() - inicio });
    const sufixo = r.erro ? ` ERRO=${r.erro.slice(0, 80)}` : "";
    console.log(
      `[busca] ${modelo} HTTP ${r.status} anotacoes=${r.anotacoes ?? "n/a"} urls=${r.urlsNoTexto ?? "n/a"} ${Date.now() - inicio}ms${sufixo}`,
    );
  }

  for (const modelo of MODELOS) {
    for (const valor of ["minimal", "low", "none"]) {
      const r: Esforco = { modelo, esforco: valor, status: 0 };
      try {
        const { status, texto } = await chamar({
          model: modelo,
          messages: [{ role: "user", content: "Responda apenas com a palavra ok." }],
          max_completion_tokens: 200,
          reasoning_effort: valor,
        });
        r.status = status;
        if (status === 200) {
          const cru = lerJson(texto);
          r.conteudo = textoDe(mensagemDo(cru).content).slice(0, 60);
          r.tokensOut = numeroDe(objeto(cru.usage)?.completion_tokens);
        } else {
          r.erro = texto.slice(0, 200);
        }
      } catch (err) {
        r.erro = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
      }
      esforco.push(r);
      console.log(`[esforco] ${modelo} reasoning_effort=${valor} HTTP ${r.status}`);
    }
  }
} finally {
  // Escrita no `finally` de proposito: sonda que morre no meio ainda deixa o que ja mediu.
  const saida = join(import.meta.dirname, "probe-busca-resultado.json");
  writeFileSync(
    saida,
    JSON.stringify({ geradoEm: new Date().toISOString(), busca, esforco }, null, 2),
    "utf8",
  );
  console.log(`busca: ${busca.length} modelos. esforco: ${esforco.length} tentativas.`);
  console.log(`resultado em ${saida}`);
}

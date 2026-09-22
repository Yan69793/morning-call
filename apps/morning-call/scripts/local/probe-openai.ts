/**
 * Sonda de compatibilidade da API da OpenAI, para escolher os modelos da cadeia.
 *
 * Por que existe. O `chatCompletion` monta o corpo no dialeto que o OpenRouter aceitava: `max_tokens`
 * e `response_format: {type: "json_object"}`. Modelo mais novo da OpenAI frequentemente exige
 * `max_completion_tokens` e recusa o outro nome com 400. Qual e qual muda por modelo e por data,
 * e nao da para saber pelo id. Em vez de escolher no escuro e descobrir as 06h30, a sonda mede.
 *
 * Tambem mede proveniencia. O plugin `web` do OpenRouter devolve `message.annotations[]`. Alguns
 * modelos da OpenAI pesquisam sozinhos e devolvem anotacao no mesmo formato, e se houver um
 * acessivel por chat completions a etapa de research deixa de ser closed-book.
 *
 * Nao faz parte do gate: depende de chave e de rede. Rode a mao, com a chave so na sessao:
 *
 *   $env:OPENAI_API_KEY = Read-Host -Prompt "chave"
 *   npx tsx scripts/local/probe-openai.ts
 *   Remove-Item Env:\OPENAI_API_KEY
 *
 * Nao imprime a chave em nenhum caminho, nem no arquivo de saida.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const chave = process.env.OPENAI_API_KEY;
if (!chave) {
  console.error("OPENAI_API_KEY ausente no ambiente. Nada foi chamado.");
  process.exit(2);
}

/**
 * Candidatos por faixa. Nomes vem da listagem real da conta em 22/09/2026, nao de memoria.
 * Cada um responde uma pergunta diferente: existe tier barato utilizavel, o tier do meio serve para
 * o strategist, e algum modelo de busca devolve anotacao por chat completions.
 */
const CANDIDATOS = [
  // Baratos, candidatos a analyst e calendario.
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-4.1-mini",
  // Meio e topo, candidatos a strategist.
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-terra",
  "gpt-6-astra",
  // Familia de conversa.
  "gpt-5.3-chat-latest",
  "gpt-5.2-chat-latest",
  // Busca embutida. Se algum funcionar por chat completions, resolve a proveniencia.
  "gpt-4o-mini-search-preview",
  "gpt-4o-search-preview",
  "gpt-5-search-api",
];

const URL_CHAT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

interface Tentativa {
  modelo: string;
  teste: string;
  status: number | null;
  erro?: string;
  /** Texto devolvido, quando houve. Truncado. */
  conteudo?: string;
  /** true quando o corpo foi aceito e o conteudo parseia como JSON. */
  jsonValido?: boolean;
  /** Quantidade de anotacoes de proveniencia devolvidas. */
  anotacoes?: number;
  tokensIn?: number;
  tokensOut?: number;
}

async function chamar(
  modelo: string,
  teste: string,
  corpo: Record<string, unknown>,
): Promise<Tentativa> {
  const base: Tentativa = { modelo, teste, status: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, messages: [{ role: "user", content: mensagem(teste) }], ...corpo }),
      signal: controller.signal,
    });
    base.status = res.status;
    const texto = await res.text();
    if (!res.ok) {
      base.erro = texto.slice(0, 300);
      return base;
    }
    const cru = JSON.parse(texto) as {
      choices?: { message?: { content?: string; annotations?: unknown[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = cru.choices?.[0]?.message;
    const conteudo = msg?.content ?? "";
    base.conteudo = conteudo.slice(0, 200);
    base.tokensIn = cru.usage?.prompt_tokens;
    base.tokensOut = cru.usage?.completion_tokens;
    base.anotacoes = msg?.annotations?.length ?? 0;
    if (teste === "json_object") {
      try {
        JSON.parse(conteudo);
        base.jsonValido = true;
      } catch {
        base.jsonValido = false;
      }
    }
    return base;
  } catch (err) {
    base.erro = err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido";
    return base;
  } finally {
    clearTimeout(timer);
  }
}

function mensagem(teste: string): string {
  // O modo `json_object` exige a palavra JSON em alguma mensagem. Sem isto o erro seria de prompt,
  // nao de compatibilidade, e a sonda mediria a coisa errada.
  return teste === "json_object"
    ? 'Devolva um JSON com uma chave "ok" de valor true.'
    : "Responda apenas com a palavra ok.";
}

const resultados: Tentativa[] = [];
for (const modelo of CANDIDATOS) {
  resultados.push(await chamar(modelo, "max_tokens", { max_tokens: 16 }));
  resultados.push(await chamar(modelo, "max_completion_tokens", { max_completion_tokens: 16 }));
  resultados.push(
    await chamar(modelo, "json_object", { max_completion_tokens: 64, response_format: { type: "json_object" } }),
  );
  resultados.push(await chamar(modelo, "busca", { max_completion_tokens: 200 }));
}

const resumo = resultados.map((r) => ({
  modelo: r.modelo,
  teste: r.teste,
  status: r.status,
  ok: r.status === 200,
  ...(r.erro ? { erro: r.erro } : {}),
  ...(r.jsonValido === undefined ? {} : { jsonValido: r.jsonValido }),
  ...(r.anotacoes === undefined ? {} : { anotacoes: r.anotacoes }),
  ...(r.tokensIn === undefined ? {} : { tokensIn: r.tokensIn, tokensOut: r.tokensOut }),
}));

const saida = join(import.meta.dirname, "probe-openai-resultado.json");
writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), resumo }, null, 2), "utf8");
console.log(`sonda concluida: ${resumo.length} tentativas em ${CANDIDATOS.length} modelos`);
console.log(`resultado em ${saida}`);

"""gerar_briefing.py — gera o briefing matinal via OpenRouter.

Carrega noticias + estado dos sistemas + mapa de exposicao.
Cadeia de modelos: primario -> fallback se reprovar.
Correcao F05: captura URLError, TimeoutError, OSError alem de HTTPError.
Correcao F30: log identifica qual modelo gerou o conteudo aprovado.

Zero dependencia externa. So stdlib.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
OUTPUT_DIR = ROOT / "outputs"

BRT = timezone(timedelta(hours=-3))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

DEFAULT_MODEL = "deepseek/deepseek-v4-pro"
DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
WEB_SEARCH_SUFFIX = ":online"

SYSTEM_PROMPT = """\
Voce e um analista de mercado senior escrevendo um briefing matinal interno para um gestor de portfolio multi-projeto.

REGRAS ABSOLUTAS:
1. Toda chamada direcional ("tende a subir", "deve cair", "vai valorizar") PRECISA citar fonte_url.
   A fonte_url TEM que estar no pool de noticias fornecido. Fonte fora do pool e alucinacao.
   Copie a URL EXATAMENTE como esta no pool, caractere por caractere, mantendo https://,
   o dominio original e o final do caminho. Nao encurte, nao troque dominio, nao invente
   extensao (.ghtml). URL errada e pior que nenhuma URL.
2. Toda chamada direcional PRECISA declarar confianca entre 0.0 e 1.0.
   confianca alta (0.7+) = multiplas fontes confirmam. confianca baixa (0.3-) = fonte unica ou correlacao incerta.
3. NUNCA cite um projeto que nao esta na lista de projetos fornecida.
   NUNCA cite um projeto com exposicao vazia ([]). Esses projetos NAO TEM relacao com mercado.
   NUNCA cite Morning Call nem Radar Quant como projetos: em 13/08 o Yan tirou
   as secoes de dados dos dois do briefing, e a leitura por projeto deles tambem saiu.
4. Briefing sem nenhuma chamada direcional e invalido. Encontre pelo menos uma leitura relevante.

FORMATO DO BRIEFING (HTML):
- Estrutura limpa, sem CSS externo, self-contained.
- Formato dos bancos globais (pesquisado em 13/08 no Deutsche Bank, Bloomberg e
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
     embutida na prosa, com fonte_url e confianca declarada, nunca como
     recomendacao de compra ou venda. OBRIGATORIO: cada ponto precisa de pelo
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
Portugues BR. Sem recomendacao de investimento."""


def _load_env() -> dict[str, str]:
    env_path = ROOT / ".env"
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for raw in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _openrouter_url(env: dict[str, str]) -> str:
    return env.get("OPENROUTER_URL", "").strip() or os.environ.get("OPENROUTER_URL", "").strip() or DEFAULT_OPENROUTER_URL


# Agenda real da casa, mantida pelo Szuchmacher-AgendaAgent (task das 08h00
# de segunda a sexta). Em 13/08 o modelo inventou CPI e reuniao do BRICS na
# agenda; desde entao a agenda entra pronta no prompt, igual ao Fechamento.
AGENDA_PATH = ROOT.parent.parent / "Site" / "site-producao" / "agenda-data.json"


def _bloco_agenda(data_tag: str) -> str:
    """Bloco de agenda real do dia para o prompt. Vazio se nao houver
    eventos confirmados, e o modelo recebe instrucao de nao inventar."""
    agenda = _load_json(AGENDA_PATH)
    linhas: list[str] = []
    if agenda:
        hoje = data_tag[:4] + "-" + data_tag[4:6] + "-" + data_tag[6:]
        eventos = [e for e in agenda.get("eventos", []) if e.get("data") == hoje]
        eventos.sort(key=lambda e: (e.get("hora_brt") or "", e.get("evento") or ""))
        for e in eventos:
            hora = e.get("hora_brt") or ""
            linhas.append(
                f"- {hora} ({e.get('regiao', '?')}): {e.get('evento', '?')} "
                f"[{e.get('fonte', '?')}]"
            )
    if not linhas:
        linhas.append(
            "- NENHUM evento confirmado para hoje na fonte oficial da casa. "
            "Escreva 'Sem eventos de agenda confirmados para hoje' e nao invente."
        )
    return "=== AGENDA DO DIA (dados oficiais, use SOMENTE estes eventos) ===\n" + "\n".join(linhas)


def _build_user_prompt(
    noticias: dict,
    estado: dict,
    exposicao: dict,
    data_tag: str,
) -> str:
    """Monta o prompt com todos os dados coletados."""
    partes: list[str] = []

    partes.append(f"DATA: {data_tag}")
    partes.append("")

    # Noticias
    itens = noticias.get("itens", [])
    partes.append(f"=== NOTICIAS DO DIA ({len(itens)} itens) ===")
    for i, item in enumerate(itens):
        partes.append(f"[{i}] {item['title']}")
        partes.append(f"    Fonte: {item['source']} | URL: {item['url']}")
        if item.get("published"):
            partes.append(f"    Data: {item['published']}")
        partes.append("")

    # Agenda oficial do dia
    partes.append(_bloco_agenda(data_tag))
    partes.append("")

    # Estado dos sistemas
    sistemas = estado.get("sistemas", {})

    mc = sistemas.get("morning-call", {})
    if mc.get("ok"):
        partes.append(f"=== MORNING CALL ===")
        partes.append(f"Trade date: {mc.get('trade_date')}")
        partes.append(f"Regime: {mc.get('regime')}")
        partes.append(f"Vies: {mc.get('vies')}")
        partes.append(f"Conviccao: {mc.get('conviccao')}/10")
        partes.append(f"N trades: {mc.get('n_trades')}")
        partes.append(f"Aprovado: {mc.get('aprovado')}")
        partes.append("")

    rq = sistemas.get("radar-quant", {})
    if rq.get("ok"):
        staleness = rq.get("staleness", {})
        partes.append("=== RADAR QUANT ===")
        partes.append(f"Market date: {staleness.get('market_date')}")
        partes.append(f"Stale: {staleness.get('stale')}")
        partes.append(f"Dias atraso: {staleness.get('dias_atraso')}")
        partes.append(f"Dias consecutivos: {staleness.get('dias_consecutivos', 0)}")
        partes.append(f"N items: {rq.get('n_items', 0)}")
        yahoo = rq.get("yahoo_fallback", {})
        if yahoo.get("acionado"):
            partes.append("YAHOO FALLBACK ACIONADO (scan fora do ar):")
            for ticker, d in yahoo.get("dados", {}).items():
                partes.append(
                    f"  {ticker}: {d.get('price')} "
                    f"(var: {d.get('changePercent')}%) "
                    f"[{d.get('fonte', 'Yahoo')}]"
                )
        partes.append("")

    vx = sistemas.get("vixradar", {})
    if vx.get("ok"):
        partes.append(f"=== VIXRADAR ===")
        partes.append(f"Status: {vx.get('status', '?')}")
        partes.append("")

    # Projetos com exposicao
    partes.append("=== PROJETOS COM EXPOSICAO A MERCADO ===")
    for slug, proj in exposicao.items():
        exp = proj.get("exposicao", [])
        if not exp:
            continue
        partes.append(f"- {proj['nome']}: {', '.join(exp)}")
        partes.append(f"  Por que: {proj['porque']}")
    partes.append("")

    # Projetos sem exposicao (NAO CITAR)
    partes.append("=== PROJETOS SEM EXPOSICAO (NAO CITAR NO BRIEFING) ===")
    for slug, proj in exposicao.items():
        exp = proj.get("exposicao", [])
        if exp:
            continue
        partes.append(f"- {proj['nome']}")

    partes.append("")
    partes.append("INSTRUCAO: Gere o briefing matinal em HTML self-contained.")
    partes.append("Inclua chamadas direcionais com fonte_url e confianca.")
    partes.append("NAO cite projetos com exposicao vazia.")
    partes.append("Se Radar Quant stale >= 2 dias consecutivos, suprima a secao e reporte a indisponibilidade.")
    partes.append("Retorne APENAS o HTML, sem texto antes ou depois.")

    return "\n".join(partes)


def _call_openrouter(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    env: dict[str, str],
) -> str:
    """Chama OpenRouter chat completions.

    Correcao F05: captura HTTPError, URLError, TimeoutError, OSError.
    Converte tudo a RuntimeError para a cadeia de modelos avancar.
    """
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    url = _openrouter_url(env)
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://szuchmacher.com.br",
            "X-Title": "Briefing Matinal v1",
            "User-Agent": UA,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        corpo = ""
        try:
            corpo = exc.read().decode("utf-8", "replace")[:500]
        except Exception:
            corpo = "(corpo indisponivel)"
        raise RuntimeError(f"OpenRouter HTTP {exc.code}: {corpo}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"OpenRouter rede/timeout: {exc}") from exc

    # Extrair conteudo com seguranca (KeyError vira RuntimeError)
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"OpenRouter resposta inesperada: {exc}") from exc

    if not content or not isinstance(content, str):
        finish_reason = payload.get("choices", [{}])[0].get("finish_reason", "desconhecido")
        raise RuntimeError(f"OpenRouter conteudo vazio ou nulo (finish_reason={finish_reason})")

    # Remove markdown fence se houver
    content = re.sub(r"^```(?:html)?\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content)
    return content


def main(argv: list[str]) -> int:
    do_send = "--send" in argv
    dry_run = "--dry-run" in argv
    env = _load_env()

    api_key = env.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        print("ERRO: OPENROUTER_API_KEY ausente no .env", file=sys.stderr)
        return 4

    hoje = date.today()
    data_tag = hoje.strftime("%Y%m%d")

    # Carregar dados
    noticias_path = LOG_DIR / f"noticias_{data_tag}.json"
    estado_path = LOG_DIR / f"estado_{data_tag}.json"
    exposicao_path = ROOT / "projetos-exposicao.json"

    noticias = _load_json(noticias_path)
    if not noticias:
        print(f"ERRO: {noticias_path} nao encontrado. Rode coletar_noticias.py primeiro.", file=sys.stderr)
        return 5

    estado = _load_json(estado_path)
    if not estado:
        print(f"ERRO: {estado_path} nao encontrado. Rode coletar_estado.py primeiro.", file=sys.stderr)
        return 5

    exposicao = _load_json(exposicao_path)
    if not exposicao:
        print(f"ERRO: {exposicao_path} nao encontrado.", file=sys.stderr)
        return 5

    # Montar prompt
    user_prompt = _build_user_prompt(noticias, estado, exposicao, data_tag)

    # Cadeia de modelos (F05 + F30 corrigidos)
    primary_model = env.get("OPENROUTER_MODEL", DEFAULT_MODEL).strip()
    fallback_model = env.get("OPENROUTER_FALLBACK_MODEL", "").strip()

    models_to_try: list[str] = [primary_model]
    if fallback_model:
        models_to_try.append(fallback_model)

    # Sufixo :online so para modelos que suportam (Gemini, nao DeepSeek)
    models_to_try = [
        f"{m}{WEB_SEARCH_SUFFIX}" if m.startswith("google/") and not m.endswith(WEB_SEARCH_SUFFIX) else m
        for m in models_to_try
    ]

    html: str | None = None
    model_used: str | None = None

    for model in models_to_try:
        print(f">>> Tentando {model} via {_openrouter_url(env)}...")
        try:
            html = _call_openrouter(api_key, model, SYSTEM_PROMPT, user_prompt, env)
        except RuntimeError as exc:
            print(f"ERRO: {exc}", file=sys.stderr)
            continue

        if not html or len(html.strip()) < 200:
            print(f"ERRO: resposta muito curta ({len(html)} chars), tentando proximo modelo...", file=sys.stderr)
            html = None
            continue

        print(f"OK: {len(html)} chars gerados por {model}")
        model_used = model
        break

    if html is None or model_used is None:
        print("REPROVADO: todos os modelos falharam. Envio abortado.", file=sys.stderr)
        return 9

    # Salvar
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"briefing_{data_tag}.html"
    out_path.write_text(html, encoding="utf-8")

    print(f"Salvo em: {out_path}")
    print(f"Modelo: {model_used}")  # F30: sempre reporta qual modelo gerou

    if do_send and not dry_run:
        print("--send: envio sera feito por enviar_briefing.py apos validacao")
    elif dry_run:
        print("--dry-run: briefing gerado, sem envio")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

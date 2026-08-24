"""validar_briefing.py — portao de validacao do briefing matinal.

6 regras. Qualquer uma falha -> REPROVADO, aborta envio.

1. Toda chamada direcional tem fonte_url no pool de noticias do dia.
2. Toda chamada direcional tem confianca declarada (0.0 a 1.0).
3. Nenhum projeto citado fora do mapa, nenhum com exposicao vazia.
4. Radar Quant stale >= 2 dias consecutivos -> secao suprimida com aviso.
5. Zero chamadas direcionais -> reprova.
6. Todo nivel de mercado citado bate com a cotacao real do pregao.

Uso:
    python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

from _comum import ATIVOS_ALIASES, ATIVOS_META

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"

# Nomes dos projetos como aparecem no mapa de exposicao
# (carregamos do JSON, mas temos fallback hardcoded para seguranca)
NOMES_PROJETOS_EXPOSTOS = {
    "VixRadar", "Morning Call", "Radar Quant", "ATLAS",
    "Fechamento Diario e Site", "Mercado de Apostas",
    "Plataforma de Carreira Executiva", "Jornada Interior",
    "Meu Assessor", "MultiAsset-Supabase",
}
NOMES_PROJETOS_SEM_EXPOSICAO = {
    "Jarvis", "graphify", "Agente Yan", "Tapetier", "Szuchmacher IA",
}

# Padroes para detectar chamadas direcionais
# Capturam frases como "tende a subir", "deve cair", "vai valorizar", "pressao de alta"
DIRECTIONAL_PATTERNS = [
    re.compile(r"tende\s+a\s+(subir|cair|valorizar|desvalorizar)", re.IGNORECASE),
    re.compile(r"deve\s+(subir|cair|valorizar|desvalorizar|recuar|avancar)", re.IGNORECASE),
    re.compile(r"vai\s+(subir|cair|valorizar|desvalorizar)", re.IGNORECASE),
    re.compile(r"press[aã]o\s+(de|para)\s+(alta|baixa|compra|venda)", re.IGNORECASE),
    re.compile(r"potencial\s+de\s+(alta|baixa|valorizacao)", re.IGNORECASE),
    re.compile(r"sinal\s+(positivo|negativo|de\s+alta|de\s+baixa)", re.IGNORECASE),
    re.compile(r"expectativa\s+(positiva|negativa|de\s+alta|de\s+baixa)", re.IGNORECASE),
    re.compile(r"vi[eé]s\s+(altista|baixista|positivo|negativo|de\s+alta|de\s+baixa)", re.IGNORECASE),
    # 14/08/2026: o prompt de gerar_briefing.py documenta "deve pressionar" e
    # "revisao para baixo/cima" como padrao valido de chamada direcional, mas o
    # validador nao os detectava. Esse drift reprovou o briefing do dia com
    # REGRA 5 mesmo com 4 confiancas declaradas e 6 URLs no pool.
    re.compile(r"(tende|deve|pode)\s+(a\s+)?pressionar", re.IGNORECASE),
    re.compile(r"revis[aã]o\s+para\s+(baixo|cima)", re.IGNORECASE),
]

# Regex para encontrar URLs no HTML (para nos colchetes das citacoes)
URL_PATTERN = re.compile(r'https?://[^\s<>"\'\[\]]+')

# Citacoes entre colchetes, sem esquema (o modelo costuma citar "[dominio/caminho]")
CITATION_PATTERN = re.compile(r"\[([^\[\]]+)\]")

# Domínios internos que nao contam como fonte de noticia
INTERNAL_DOMAINS = ("szuchmacher.com.br", "localhost", "127.0.0.1")


def _normalize_url(u: str) -> str | None:
    """Normaliza para host + caminho, sem esquema, sem www e sem barra final.

    Retorna None se nao parecer URL.
    """
    u = u.strip().rstrip(".").rstrip(")")
    if not u.startswith("http"):
        u = "https://" + u
    m = re.match(r"https?://([^/?#]+)(/[^?#]*)?", u)
    if not m:
        return None
    host = m.group(1).lower()
    if host.startswith("www."):
        host = host[4:]
    path = (m.group(2) or "/").rstrip("/")
    return f"{host}{path}"

# Regex para confianca declarada
CONFIANCA_PATTERN = re.compile(r'confian[cç]a\s*[:=]?\s*(\d+[.,]\d+)', re.IGNORECASE)


def _load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _find_directional_paragraphs(html: str) -> list[str]:
    """Encontra paragrafos ou trechos com linguagem direcional.

    Devolve lista de trechos (max 300 chars ao redor do match).
    """
    # Remove tags HTML para buscar so no texto
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    encontrados: list[str] = []
    for pattern in DIRECTIONAL_PATTERNS:
        for match in pattern.finditer(text):
            start = max(0, match.start() - 150)
            end = min(len(text), match.end() + 150)
            trecho = text[start:end].strip()
            if trecho not in encontrados:
                encontrados.append(trecho)

    return encontrados


def _extract_urls(html: str) -> set[str]:
    """Extrai todas as URLs do HTML."""
    return set(URL_PATTERN.findall(html))


def _find_project_mentions(html: str) -> set[str]:
    """Encontra nomes de projetos citados no texto.

    Procura por nomes exatos no texto apos remover tags HTML.
    """
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    text_lower = text.lower()

    mencionados: set[str] = set()

    # Projetos com exposicao
    for nome in NOMES_PROJETOS_EXPOSTOS:
        if nome.lower() in text_lower:
            mencionados.add(nome)

    # Projetos sem exposicao (PROIBIDOS)
    for nome in NOMES_PROJETOS_SEM_EXPOSICAO:
        if nome.lower() in text_lower:
            mencionados.add(f"PROIBIDO:{nome}")

    return mencionados


def _check_radar_quant_staleness(html: str, estado: dict) -> tuple[bool, str]:
    """REGRA 4 neutralizada em 13/08/2026.

    O Yan tirou a secao RADAR QUANT do briefing, entao nao ha mais secao
    para exigir aviso de indisponibilidade. A checagem antiga fica abaixo,
    em comentario, para o caso de a secao voltar:

        rq = estado.get("sistemas", {}).get("radar-quant", {})
        staleness = rq.get("staleness", {})
        if not staleness.get("stale"):
            return True, "Radar Quant fresco, nenhuma acao necessaria"
        dias = staleness.get("dias_consecutivos", 0)
        if dias < 2:
            return True, f"Radar Quant stale ha {dias} dia(s), abaixo do limite de 2"
        text = re.sub(r"<[^>]+>", " ", html).lower()
        indicadores = ["fora do ar", "indisponivel", "scan suspenso",
                       "scan fora do ar", "dados indisponiveis",
                       "yahoo finance", "fallback", "nao esta disponivel"]
        for indicador in indicadores:
            if indicador in text:
                return True, f"Radar Quant stale ({dias}d), aviso de indisponibilidade detectado"
        return False, "Radar Quant stale ha dias consecutivos, mas secao NAO foi suprimida"
    """
    return True, "Secao Radar Quant removida do briefing (decisao 13/08), staleness nao se aplica"


def _normalizar(texto: str) -> str:
    """Minusculo e sem acento, para casar alias com o corpo do briefing."""
    sem_acento = unicodedata.normalize("NFKD", texto)
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return sem_acento.lower()


def _parse_num_br(bruto: str) -> float | None:
    """Converte numero escrito em pt-BR para float.

    "118.753,48" -> 118753.48   ponto e milhar, virgula e decimal
    "5,17"       -> 5.17
    "171.032"    -> 171032.0    grupos de 3 digitos, milhar
    "1.5"        -> 1.5         grupo fora de 3 digitos, decimal
    """
    bruto = bruto.strip().rstrip(".,")
    if not bruto or not any(c.isdigit() for c in bruto):
        return None
    try:
        if "," in bruto:
            return float(bruto.replace(".", "").replace(",", "."))
        if "." in bruto:
            partes = bruto.split(".")
            if all(len(p) == 3 for p in partes[1:]):
                return float(bruto.replace(".", ""))
            return float(bruto)
        return float(bruto)
    except ValueError:
        return None


# Nivel de mercado so conta quando vem com marcador de unidade. Sem isso,
# "sequencia de 11 quedas" e "235 mil pedidos" virariam candidatos a cotacao
# e reprovariam briefing correto. Os dois casos sao reais, sairam do texto
# do briefing_20260820.html.
NIVEL_PATTERNS = [
    re.compile(r"(?:r\$|us\$|\$)\s*([\d][\d.,]*)", re.IGNORECASE),
    # Pontuacao so conta como NIVEL quando vem depois de preposicao de destino.
    # "fechou em 167.830 pontos" e nivel, "caiu 1.200 pontos" e variacao. Sem
    # essa exigencia o portao leria a queda em pontos como se fosse o indice.
    re.compile(r"\b(?:para|em|aos?|ate)\s+([\d][\d.,]*)\s*pontos?\b", re.IGNORECASE),
]

# Verbo de variacao logo antes do numero indica delta, nao nivel. Cobre o caso
# "o dolar caiu R$ 0,05", que nao e cotacao.
# O marcador de moeda entra no meio ("caiu R$ 0,05"), por isso ele e opcional
# aqui: a posicao do candidato e a do numero, nao a do R$.
# Lista explicita de proposito. A versao anterior usava `ca[ií]ram?`, que casa
# "caira" e "cairam" e nunca "caiu", justamente a forma mais comum no texto.
# O teste do delta em reais pegou isso.
DELTA_VERBOS = (
    "caiu", "cairam", "subiu", "subiram", "recuou", "recuaram",
    "avancou", "avancaram", "ganhou", "ganharam", "perdeu", "perderam",
    "variou", "variaram", "oscilou", "oscilaram", "valorizou", "valorizaram",
    "desvalorizou", "desvalorizaram",
)
DELTA_ANTES = re.compile(
    r"\b(?:" + "|".join(DELTA_VERBOS) + r")\s+"
    r"(?:cerca de\s+)?(?:r\$|us\$|\$)?\s*$"
)

# Taxa de juro e nivel, nao variacao, apesar de vir escrita com %. Sem esta
# distincao a Selic entraria em pcts e nunca seria conferida, porque os dois
# outros marcadores de nivel sao R$/US$ e "pontos". Exige "ao ano" ou "a.a."
# de proposito: "Selic subiu 0,25%" e variacao e nao pode virar nivel.
TAXA_PATTERN = re.compile(r"([\d][\d.,]*)\s*%\s*(?:a\.?\s?a\.?|ao\s+ano)", re.IGNORECASE)
PCT_PATTERN = re.compile(r"([\d][\d.,]*)\s*%")

# Numero em janela de projecao nao e cotacao e nao entra na conta. Caso real
# do briefing_20260820.html: "o JPMorgan alerta que as eleicoes podem levar o
# dolar a R$ 5,50". A frase esta correta, R$ 5,50 e previsao de terceiro, e a
# primeira versao da REGRA 6 reprovava o briefing por causa dela mesmo tendo
# acertado o fechamento de R$ 5,17 na frase anterior.
PROJECAO_PATTERN = re.compile(
    r"\b(pode(m)?\s+(levar|chegar|ir|atingir|alcancar)|projet\w+|previs\w+|"
    r"estimativ\w+|estima\b|alerta\s+que|cenario|meta\s+de|deve\s+chegar|"
    r"ate\s+o\s+(fim|final)|aposta\w*|espera\s+que)\b"
)

# Janela em torno do alias onde o numero ainda e considerado do ativo.
# Limite externo apenas: o corte real e a frase, ver _janela_da_mencao.
JANELA_ANTES = 60
JANELA_DEPOIS = 180

# Fim de frase. O lookahead pelo espaco evita cortar dentro de "118.753,48",
# onde o ponto e separador de milhar e nao tem espaco depois.
FIM_DE_FRASE = re.compile(r"[.;!?]\s")


def _frases(texto: str) -> list[tuple[int, int]]:
    """Spans (inicio, fim) de cada frase do texto normalizado."""
    spans: list[tuple[int, int]] = []
    ini = 0
    for m in FIM_DE_FRASE.finditer(texto):
        spans.append((ini, m.start()))
        ini = m.end()
    if ini < len(texto):
        spans.append((ini, len(texto)))
    return spans


def _candidatos_de_nivel(texto: str) -> list[tuple[int, float]]:
    """Numeros que afirmam nivel de mercado, com a posicao de cada um.

    So conta numero com marcador de unidade. Sem isso, "sequencia de 11
    quedas" e "235 mil pedidos" virariam cotacao e reprovariam briefing bom.
    Os dois casos sao reais, sairam do briefing_20260820.html.
    """
    achados: list[tuple[int, float]] = []
    for pat in [*NIVEL_PATTERNS, TAXA_PATTERN]:
        for m in pat.finditer(texto):
            # O recorte ancora no NUMERO (start do grupo 1), nao no inicio do
            # match. Com m.start() a fatia parava antes da preposicao e
            # "avancou para 167.830 pontos" era lido como delta, descartando
            # um nivel legitimo.
            pos = m.start(1)
            if DELTA_ANTES.search(texto[max(0, pos - 30) : pos]):
                continue
            v = _parse_num_br(m.group(1))
            if v is not None:
                achados.append((pos, v))
    return sorted(achados)


def _check_numeros_mercado(html: str, precos: dict) -> tuple[list[str], list[str], list[str]]:
    """REGRA 6. Confronta nivel citado no texto com a cotacao real.

    Criada em 24/08/2026. As regras 1 a 5 cuidam de fonte, confianca e
    escopo, nenhuma olha valor. O briefing_20260820.html passou o portao
    inteiro afirmando Ibovespa em 118.753,48 quando o fechamento da vespera
    foi 167.830, porque o gerar_briefing.py nao recebia cotacao nenhuma no
    prompt e o modelo preencheu de memoria.

    Criterio, deliberadamente conservador para nao reprovar briefing bom:

      - so entra na conta numero com marcador de unidade (R$, US$, pontos);
      - numero seguido de % e variacao, nao nivel, e vira aviso e nao veto;
      - ativo citado sem nenhum nivel na janela e ignorado, nao e erro;
      - ativo com nivel citado onde NENHUM candidato bate a tolerancia
        reprova, porque ai o briefing afirmou um numero que nao existe.

    A comparacao ancora no trade_date do arquivo de precos, que e o pregao
    encerrado, nunca o dia de coleta.
    """
    problemas: list[str] = []
    oks: list[str] = []
    avisos: list[str] = []

    texto = _normalizar(re.sub(r"<[^>]+>", " ", html))
    texto = re.sub(r"\s+", " ", texto)
    ativos = precos.get("ativos", {})

    # Mapa de todas as mencoes a ativo no texto, do alias mais longo para o
    # mais curto, sem sobreposicao. Serve para cortar a janela de um ativo
    # quando comeca a mencao de outro: no briefing_20260820.html a janela do
    # Ibovespa alcancava "fechando a R$ 5,17" da frase do dolar. Nao mudou o
    # veredito daquele caso, mas o espelho e perigoso, um ativo passaria
    # emprestando o nivel correto do vizinho.
    mencoes: list[tuple[int, int, str]] = []
    pares = [
        (t, _normalizar(a))
        for t, lista in ATIVOS_ALIASES.items()
        for a in lista
        if t in ativos
    ]
    for ticker, alvo in sorted(pares, key=lambda p: -len(p[1])):
        for m in re.finditer(rf"\b{re.escape(alvo)}\b", texto):
            if any(m.start() < fim and ini < m.end() for ini, fim, _ in mencoes):
                continue
            mencoes.append((m.start(), m.end(), ticker))
    mencoes.sort()

    # Cada numero pertence a UMA mencao, a mais proxima antes dele dentro da
    # mesma frase. Janela por caractere nao serve: em "o dolar subindo para
    # R$ 5,22 e o Ibovespa ... caindo 1,14%" o R$ 5,22 fica entre as duas
    # mencoes e a janela do Ibovespa o herdava, reprovando um briefing que
    # nunca afirmou nivel de indice. Caso real do briefing_20260818.html.
    por_ticker: dict[str, list[float]] = {}
    for pos, valor in _candidatos_de_nivel(texto):
        frase = next(((a, b) for a, b in _frases(texto) if a <= pos < b), None)
        if frase is None:
            continue
        a, b = frase
        if PROJECAO_PATTERN.search(texto[a:b]):
            continue
        antes = [m for m in mencoes if a <= m[0] < pos]
        depois = [m for m in mencoes if pos < m[0] < b]
        dono = antes[-1] if antes else (depois[0] if depois else None)
        if dono is None:
            continue
        por_ticker.setdefault(dono[2], []).append(valor)

    # Decisao por ativo. Um ativo citado corretamente em algum ponto do texto
    # esta conferido, e o portao so reprova quando NENHUM numero atribuido a
    # ele bate com a cotacao.
    for ticker in sorted(por_ticker):
        dado = ativos[ticker]
        close = dado.get("close")
        trade_date = dado.get("trade_date")
        if close is None or not trade_date:
            problemas.append(
                f"REGRA 6: {ticker} citado no briefing mas sem close ou sem trade_date "
                "no arquivo de precos, coleta incompleta e o portao fica cego nesse ativo"
            )
            continue

        if dado.get("quorum") == "divergencia":
            problemas.append(
                f"REGRA 6: {ticker} com divergencia de {dado.get('divergencia_pct')}% entre "
                "fontes independentes, nao ha cotacao confiavel para conferir o briefing"
            )
            continue

        meta = ATIVOS_META.get(ticker, {})
        tolerancia = dado.get("tolerancia") or meta.get("tolerancia") or 1.0
        unidade = dado.get("unidade") or meta.get("unidade") or "pct"
        candidatos = por_ticker[ticker]

        if unidade == "bp":
            bate = [v for v in candidatos if abs(v - close) * 100 <= tolerancia]
            desc_tol = f"{tolerancia:g} bp"
        else:
            bate = [
                v for v in candidatos
                if close and abs(v - close) / abs(close) * 100 <= tolerancia
            ]
            desc_tol = f"{tolerancia:g}%"

        if bate:
            oks.append(
                f"{ticker}: {bate[0]:g} confere com {close:g} "
                f"(pregao {trade_date}, tolerancia {desc_tol})"
            )
        else:
            citados = ", ".join(f"{v:g}" for v in candidatos[:4])
            problemas.append(
                f"REGRA 6: {ticker} citado como {citados} mas o fechamento de "
                f"{trade_date} foi {close:g} (tolerancia {desc_tol}, fonte "
                f"{dado.get('fonte', 'n/d')})"
            )

    return problemas, oks, avisos


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Uso: python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html", file=sys.stderr)
        return 2

    html_path = Path(argv[1])
    if not html_path.exists():
        print(f"ERRO: arquivo nao encontrado: {html_path}", file=sys.stderr)
        return 3

    html = html_path.read_text(encoding="utf-8")

    # Extrair data do nome do arquivo
    date_match = re.search(r"(\d{8})", html_path.stem)
    data_tag = date_match.group(1) if date_match else date.today().strftime("%Y%m%d")

    # Carregar dados de referencia
    noticias = _load_json(LOG_DIR / f"noticias_{data_tag}.json")
    estado = _load_json(LOG_DIR / f"estado_{data_tag}.json")
    precos = _load_json(LOG_DIR / f"precos_{data_tag}.json")
    exposicao = _load_json(ROOT / "projetos-exposicao.json")

    # Pool de URLs das noticias, normalizado (host + caminho)
    url_pool_norm: set[str] = set()
    if noticias:
        for item in noticias.get("itens", []):
            if item.get("url"):
                n = _normalize_url(item["url"])
                if n:
                    url_pool_norm.add(n)

    problemas: list[str] = []
    avisos: list[str] = []
    urls_fora_do_pool: list[str] = []

    # === Regra 1: fonte_url no pool ===
    direcionais = _find_directional_paragraphs(html)
    urls_no_html = _extract_urls(html)
    # Citacoes entre colchetes tambem contam (o modelo cita sem esquema).
    # So entram na checagem as que parecem URL, para nao punir texto comum.
    citacoes_url = {
        c for c in CITATION_PATTERN.findall(html)
        if re.match(r"^[a-zA-Z0-9./-]+\.[a-z]{2,}(/|$)", c.strip())
    }

    if not direcionais:
        problemas.append("REGRA 5: Nenhuma chamada direcional encontrada. Briefing vazio.")
    else:
        print(f"OK: {len(direcionais)} chamada(s) direcional(is) encontrada(s)")

        # Cada URL ou citacao precisa bater com um item do pool por host + caminho.
        # Em 13/08 o modelo citou "g1.globo.com/mundo/.../teera.ghtml", misturando
        # dominio do G1 com o caminho de uma noticia da Infomoney e inventando a
        # extensao. A checagem por substring deixava passar e o link dava 404.
        urls_fora_do_pool = []
        for u in urls_no_html | citacoes_url:
            if any(d in u for d in INTERNAL_DOMAINS):
                continue
            n = _normalize_url(u)
            if n is None or n not in url_pool_norm:
                urls_fora_do_pool.append(u)
        if urls_fora_do_pool:
            problemas.append(
                f"REGRA 1: {len(urls_fora_do_pool)} URL(s) no briefing nao estao no pool de noticias: "
                + ", ".join(sorted(urls_fora_do_pool)[:5])
            )
        else:
            print(f"OK: {len(urls_no_html)} URL(s) e {len(citacoes_url)} citacao(oes) no briefing, todas no pool de noticias")

    # === Regra 2: confianca declarada ===
    confiancas = CONFIANCA_PATTERN.findall(html)
    if direcionais and not confiancas:
        problemas.append("REGRA 2: Chamadas direcionais sem confianca declarada (ex.: 'confianca: 0.7')")
    elif confiancas:
        print(f"OK: {len(confiancas)} confianca(s) declarada(s): {', '.join(confiancas[:5])}")

    # === Regra 3: projetos citados ===
    mencionados = _find_project_mentions(html)
    proibidos = [m for m in mencionados if m.startswith("PROIBIDO:")]
    if proibidos:
        nomes = [m.replace("PROIBIDO:", "") for m in proibidos]
        problemas.append(f"REGRA 3: Projeto(s) sem exposicao a mercado citado(s): {', '.join(nomes)}")
    else:
        permitidos = [m for m in mencionados if not m.startswith("PROIBIDO:")]
        if permitidos:
            print(f"OK: {len(permitidos)} projeto(s) citado(s), todos com exposicao: {', '.join(sorted(permitidos))}")
        else:
            avisos.append("Nenhum projeto citado no briefing. Pode estar incompleto.")

    # === Regra 4: staleness do Radar Quant ===
    if estado:
        ok_stale, msg_stale = _check_radar_quant_staleness(html, estado)
        if ok_stale:
            print(f"OK: {msg_stale}")
        else:
            problemas.append(f"REGRA 4: {msg_stale}")
    else:
        avisos.append("Arquivo de estado nao encontrado, pulando verificacao de staleness")

    # === Regra 6: nivel de mercado citado bate com a cotacao real ===
    # Falha fechada de proposito. Sem arquivo de precos o portao fica cego
    # justamente na classe de erro mais cara, numero inventado indo para
    # cliente. Preferimos travar o envio a aprovar sem conferir.
    if precos and precos.get("ativos"):
        p6, ok6, av6 = _check_numeros_mercado(html, precos)
        problemas.extend(p6)
        avisos.extend(av6)
        for linha in ok6:
            print(f"OK: {linha}")
        if not p6 and not ok6:
            avisos.append("REGRA 6: nenhum nivel de mercado citado no briefing, nada a conferir")
    elif precos:
        # Arquivo existe mas veio vazio: coletar_precos.py nao trouxe nenhum
        # ativo. O portao esta cego, e cego com arquivo no lugar e pior que
        # cego sem arquivo, porque parece que conferiu.
        problemas.append(
            f"REGRA 6: logs/precos_{data_tag}.json sem nenhum ativo "
            f"({len(precos.get('erros') or [])} erro(s) na coleta). "
            "Nenhum numero pode ser conferido."
        )
    else:
        problemas.append(
            f"REGRA 6: logs/precos_{data_tag}.json nao encontrado. "
            "Rode coletar_precos.py antes de validar."
        )

    # === Resultado ===
    print()
    if problemas:
        print(f"REPROVADO — {len(problemas)} problema(s):")
        for p in problemas:
            print(f"  - {p}")
        if avisos:
            print(f"\n{len(avisos)} aviso(s):")
            for a in avisos:
                print(f"  - {a}")

        # Salvar log de validacao
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_path = LOG_DIR / f"validacao_{data_tag}.json"
        log_path.write_text(json.dumps({
            "resultado": "REPROVADO",
            "data": data_tag,
            "problemas": problemas,
            "avisos": avisos,
            "n_direcionais": len(direcionais),
            "n_confiancas": len(confiancas),
            "n_urls_no_html": len(urls_no_html),
            "n_urls_fora_pool": len(urls_fora_do_pool),
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        return 1

    print(f"APROVADO — {len(direcionais)} chamadas direcionais, {len(confiancas)} confiancas, {len(urls_no_html)} URLs")
    if avisos:
        print(f"\n{len(avisos)} aviso(s):")
        for a in avisos:
            print(f"  - {a}")

    # Salvar log de validacao
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"validacao_{data_tag}.json"
    log_path.write_text(json.dumps({
        "resultado": "APROVADO",
        "data": data_tag,
        "avisos": avisos,
        "n_direcionais": len(direcionais),
        "n_confiancas": len(confiancas),
        "n_urls_no_html": len(urls_no_html),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

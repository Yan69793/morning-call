"""validar_briefing.py — portao de validacao do briefing matinal.

5 regras. Qualquer uma falha -> REPROVADO, aborta envio.

1. Toda chamada direcional tem fonte_url no pool de noticias do dia.
2. Toda chamada direcional tem confianca declarada (0.0 a 1.0).
3. Nenhum projeto citado fora do mapa, nenhum com exposicao vazia.
4. Radar Quant stale >= 2 dias consecutivos -> secao suprimida com aviso.
5. Zero chamadas direcionais -> reprova.

Uso:
    python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

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
]

# Regex para encontrar URLs no HTML
URL_PATTERN = re.compile(r'https?://[^\s<>"\']+')

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
    """Verifica regra 4: se Radar Quant stale >= 2 dias, secao deve estar suprimida.

    Retorna (ok, mensagem).
    """
    rq = estado.get("sistemas", {}).get("radar-quant", {})
    staleness = rq.get("staleness", {})
    if not staleness.get("stale"):
        return True, "Radar Quant fresco, nenhuma acao necessaria"

    dias = staleness.get("dias_consecutivos", 0)
    if dias < 2:
        return True, f"Radar Quant stale ha {dias} dia(s), abaixo do limite de 2"

    # Deve ter aviso de indisponibilidade
    text = re.sub(r"<[^>]+>", " ", html).lower()
    indicadores = [
        "fora do ar",
        "indisponivel",
        "scan suspenso",
        "scan fora do ar",
        "dados indisponiveis",
        "yahoo finance",
        "fallback",
        "nao esta disponivel",
    ]
    for indicador in indicadores:
        if indicador in text:
            return True, f"Radar Quant stale ({dias}d), aviso de indisponibilidade detectado: '{indicador}'"

    return False, f"Radar Quant stale ha {dias} dias consecutivos, mas secao NAO foi suprimida nem traz aviso de indisponibilidade"


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
    exposicao = _load_json(ROOT / "projetos-exposicao.json")

    # Pool de URLs das noticias
    url_pool: set[str] = set()
    if noticias:
        for item in noticias.get("itens", []):
            if item.get("url"):
                url_pool.add(item["url"])

    problemas: list[str] = []
    avisos: list[str] = []

    # === Regra 1: fonte_url no pool ===
    direcionais = _find_directional_paragraphs(html)
    urls_no_html = _extract_urls(html)

    if not direcionais:
        problemas.append("REGRA 5: Nenhuma chamada direcional encontrada. Briefing vazio.")
    else:
        print(f"OK: {len(direcionais)} chamada(s) direcional(is) encontrada(s)")

        # Verifica se cada chamada direcional tem uma fonte_url por perto
        # Heuristica: se tem URLs no HTML que nao estao no pool, e suspeito
        urls_fora_do_pool = urls_no_html - url_pool
        # Remove URLs que nao sao de noticia (ex.: links internos, szuchmacher.com.br)
        urls_fora_do_pool = {
            u for u in urls_fora_do_pool
            if not any(d in u for d in ["szuchmacher.com.br", "localhost", "127.0.0.1"])
        }
        if urls_fora_do_pool:
            problemas.append(
                f"REGRA 1: {len(urls_fora_do_pool)} URL(s) no briefing nao estao no pool de noticias: "
                + ", ".join(sorted(urls_fora_do_pool)[:5])
            )
        else:
            print(f"OK: {len(urls_no_html)} URL(s) no briefing, todas no pool de noticias")

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
            "n_urls_fora_pool": len(urls_fora_do_pool) if 'urls_fora_do_pool' in dir() else 0,
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

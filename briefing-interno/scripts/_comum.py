"""_comum.py — helpers compartilhados dos scripts do briefing-interno.

Criado em 14/08/2026 para o achado I01 do PENDENCIAS.md: o coletar_estado.py
lia as URLs dos workers so de os.environ e ignorava o .env. Os scripts
existentes ainda tem copias locais de load_env/load_json (achado A01); a
migracao para este modulo deve acontecer um script por vez, sem pressa.
"""

from __future__ import annotations

from datetime import timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BRT = timezone(timedelta(hours=-3))

# Ativos acompanhados pelo briefing. Movido de coletar_estado.py em 24/08/2026,
# quando o coletar_precos.py passou a precisar do mesmo mapa. Duas copias do
# mapa de simbolos divergiriam do mesmo jeito que duas copias de um schema.
YAHOO_SYMBOLS = {
    "IBOV": "^BVSP",
    "USDBRL": "BRL=X",
    "SPX": "^GSPC",
    "VIX": "^VIX",
    "DXY": "DX-Y.NYB",
    "GOLD": "GC=F",
    "WTI": "CL=F",
    "BTC": "BTC-USD",
    "PETR4": "PETR4.SA",
    "VALE3": "VALE3.SA",
    "ITUB4": "ITUB4.SA",
    "BBDC4": "BBDC4.SA",
    "ABEV3": "ABEV3.SA",
    "WEGE3": "WEGE3.SA",
}

# Unidade e tolerancia por ativo, usadas pela REGRA 6 do validar_briefing.py.
#
# Tolerancia unica nao serve: 1% em cima de 5,16 (dolar) e 5 centavos, 1% em
# cima de 170.000 (Ibovespa) e 1.700 pontos. Um mesmo numero significa erro
# grosseiro num ativo e ruido no outro. Por isso a tolerancia e por classe.
#
# "pct" compara variacao percentual absoluta contra o valor de referencia.
# "bp" compara diferenca em pontos-base, para taxa de juros, onde 0,25 p.p.
# e uma decisao de Copom inteira e nao um arredondamento.
#
# Valores iniciais de 24/08/2026, calibraveis quando houver serie real.
# Nao havia convencao de unidade herdavel no projeto: docs/DATA_SOURCES.md
# lista endpoints mas nao define tolerancia nem unidade de comparacao.
ATIVOS_META = {
    "IBOV": {"classe": "indice", "unidade": "pct", "tolerancia": 0.5},
    "SPX": {"classe": "indice", "unidade": "pct", "tolerancia": 0.5},
    "USDBRL": {"classe": "cambio", "unidade": "pct", "tolerancia": 1.0},
    "DXY": {"classe": "cambio", "unidade": "pct", "tolerancia": 1.0},
    "VIX": {"classe": "volatilidade", "unidade": "pct", "tolerancia": 2.0},
    "GOLD": {"classe": "commodity", "unidade": "pct", "tolerancia": 0.5},
    "WTI": {"classe": "commodity", "unidade": "pct", "tolerancia": 0.5},
    "BTC": {"classe": "cripto", "unidade": "pct", "tolerancia": 1.5},
    "PETR4": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "VALE3": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "ITUB4": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "BBDC4": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "ABEV3": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "WEGE3": {"classe": "acao", "unidade": "pct", "tolerancia": 0.5},
    "SELIC": {"classe": "juro", "unidade": "bp", "tolerancia": 5.0},
}

# Como o ativo aparece escrito no briefing. Usado pela REGRA 6 para localizar
# o numero no texto. Minusculo, sem acento: o casamento normaliza os dois lados.
ATIVOS_ALIASES = {
    "IBOV": ["ibovespa", "ibov"],
    "SPX": ["s&p 500", "s&p500", "sp500", "standard & poor"],
    # "cambio", "vale" e "petroleo" sozinhos ficaram de fora de proposito:
    # casam com texto comum ("vale a pena", "politica cambial") e trariam o
    # numero da frase errada para dentro da janela do ativo.
    "USDBRL": ["dolar", "usd/brl", "usdbrl", "real frente ao dolar"],
    "DXY": ["dxy", "indice do dolar"],
    "VIX": ["vix"],
    "GOLD": ["ouro", "gold"],
    "WTI": ["wti", "petroleo wti", "petroleo bruto"],
    "BTC": ["bitcoin", "btc"],
    "PETR4": ["petr4", "petrobras"],
    "VALE3": ["vale3"],
    "ITUB4": ["itub4", "itau"],
    "BBDC4": ["bbdc4", "bradesco"],
    "ABEV3": ["abev3", "ambev"],
    "WEGE3": ["wege3", "weg"],
    "SELIC": ["selic", "taxa basica de juros", "meta selic"],
}


def load_env() -> dict[str, str]:
    """Le o .env do briefing-interno (utf-8-sig, como os demais parsers).

    Devolve dict com as chaves do arquivo. Nao le os.environ: o chamador
    decide a precedencia (sessao do Task Scheduler costuma vencer).
    """
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


def get_json(url: str, timeout: int = 20):
    """GET JSON com User-Agent. Devolve None em qualquer erro.

    Nao levanta: o chamador decide o que fazer com fonte ausente, e no
    coletar_precos.py fonte ausente vira erro registrado no arquivo, nao
    excecao que derruba a coleta dos outros ativos.
    """
    import json
    import urllib.request

    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _barras_diarias(result: dict) -> list[tuple[str, float]]:
    """Extrai (trade_date, close) das barras diarias de um chart do Yahoo.

    Descarta a barra do pregao corrente e a barra sintetica que o Yahoo
    anexa com a cotacao ao vivo. Medido em 24/08/2026:

      ^BVSP  ts == regularMarketTime, 21/08 22:59, close 170448.875,
             duplicando a data do fechamento oficial de 21/08 (171032.0)
      BRL=X  ts == regularMarketTime, 24/08 07:42, dia que nem fechou
      CL=F   barra diaria de 24/08 ja existe, ainda incompleta

    Pegar a ultima barra erra nos tres casos. Sao tres filtros, e os tres
    sao necessarios:

    1. descarta barra com data igual ou posterior a hoje no fuso da bolsa,
       que mata o pregao em curso;
    2. descarta a barra cujo timestamp e o proprio regularMarketTime;
    3. deduplica por data ficando com a PRIMEIRA ocorrencia, que e a barra
       diaria oficial. Sem este terceiro filtro o caso ^BVSP de segunda
       passa batido, porque a barra sintetica de sexta 22:59 tem data de
       sexta e sobrevive ao filtro 1, entrando depois da oficial e virando
       o "fechamento" com 171032.0 empurrado para previous_close.
    """
    from datetime import datetime, timedelta, timezone as _tz

    meta = result.get("meta", {})
    offset = meta.get("gmtoffset") or 0
    tz_bolsa = _tz(timedelta(seconds=offset))
    hoje_bolsa = datetime.now(tz_bolsa).date()
    market_time = meta.get("regularMarketTime")

    timestamps = result.get("timestamp") or []
    try:
        closes = result["indicators"]["quote"][0].get("close") or []
    except (KeyError, IndexError, TypeError):
        return []

    por_data: dict[str, float] = {}
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        if market_time is not None and ts == market_time:
            continue
        d = datetime.fromtimestamp(ts, tz_bolsa).date()
        if d >= hoje_bolsa:
            continue
        chave = d.isoformat()
        if chave in por_data:
            continue
        por_data[chave] = float(close)

    return sorted(por_data.items())


def arredonda_cotacao(valor: float | None) -> float | None:
    """Corta o ruido de float da resposta do Yahoo.

    O bruto vem como 7674.3701171875 e 15.130000114440918. Esse numero entra
    no prompt do modelo, e precisao falsa no prompt vira precisao falsa no
    texto que o cliente le. Duas casas acima de 100, quatro abaixo, que e o
    que separa indice de par de moedas sem precisar de tabela por ativo.
    """
    if valor is None:
        return None
    return round(valor, 2 if abs(valor) >= 100 else 4)


def fetch_yahoo_fechamentos(symbols: dict[str, str]) -> tuple[dict[str, dict], list[str]]:
    """Busca o fechamento do ultimo pregao encerrado para cada simbolo.

    Devolve ({ticker: {close, trade_date, previous_close, change_percent}},
    lista de erros). O trade_date vem da barra, nunca do dia de coleta:
    o campo "date" do _fetch_yahoo antigo em coletar_estado.py gravava
    date.today(), que numa segunda-feira etiqueta o fechamento de sexta
    com a data errada e envenena qualquer calibracao feita em cima.
    """
    import urllib.parse

    out: dict[str, dict] = {}
    erros: list[str] = []
    for ticker, simbolo in symbols.items():
        url = (
            "https://query1.finance.yahoo.com/v8/finance/chart/"
            f"{urllib.parse.quote(simbolo)}?interval=1d&range=1mo"
        )
        data = get_json(url, timeout=15)
        if not data:
            erros.append(f"{ticker}: Yahoo sem resposta ({simbolo})")
            continue
        try:
            result = data["chart"]["result"][0]
        except (KeyError, IndexError, TypeError):
            erros.append(f"{ticker}: resposta do Yahoo sem chart.result ({simbolo})")
            continue

        barras = _barras_diarias(result)
        if not barras:
            erros.append(f"{ticker}: nenhuma barra de pregao encerrado ({simbolo})")
            continue

        trade_date, close = barras[-1]
        anterior = barras[-2][1] if len(barras) >= 2 else None
        out[ticker] = {
            "close": arredonda_cotacao(close),
            "trade_date": trade_date,
            "previous_close": arredonda_cotacao(anterior),
            "change_percent": (
                round((close - anterior) / anterior * 100, 2) if anterior else None
            ),
            "simbolo": simbolo,
        }
    return out, erros

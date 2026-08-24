"""coletar_precos.py — cotacao de fechamento do ultimo pregao encerrado.

Criado em 24/08/2026. Motivo, medido e nao suposto: o briefing citava nivel
de indice sem receber nenhuma cotacao no prompt. O gerar_briefing.py so
injetava preco dentro do ramo `if yahoo.get("acionado")` do estado, que so
existe quando o Radar Quant esta stale ha mais de 2 dias (4 de 9 arquivos
estado_*.json tinham preco). Nos outros dias o modelo escrevia o numero de
memoria. O briefing de 20/08/2026 saiu com Ibovespa em 118.753,48 quando o
fechamento real da vespera era 167.927 e o de 21/08 foi 171.032. Erro de 44%.

Este script grava logs/precos_<data>.json, que serve a dois consumidores:
  - gerar_briefing.py, que passa a injetar o bloco no prompt sempre;
  - validar_briefing.py REGRA 6, que confronta numero citado com cotacao.

Duas fontes, sem chave, ambas testadas ao vivo em 24/08/2026:
  - Yahoo Finance v8 chart, indice/acao/commodity/cripto/cambio;
  - BCB, PTAX (Olinda) para o dolar oficial e SGS para a meta Selic.

O trade_date e sempre o do pregao, nunca o dia de coleta. Essa distincao e o
ponto inteiro do arquivo: o _fetch_yahoo do coletar_estado.py gravava
date.today(), que numa segunda-feira etiqueta o fechamento de sexta com a
data errada.

Zero dependencia externa. So stdlib.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta

from _comum import (
    ATIVOS_META,
    BRT,
    ROOT,
    YAHOO_SYMBOLS,
    fetch_yahoo_fechamentos,
    get_json,
)

LOG_DIR = ROOT / "logs"

PTAX_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
    "?@dataInicial='{ini}'&@dataFinalCotacao='{fim}'&$format=json&$top=100"
)
# Consulta por periodo, e nao `ultimos/N`, por dois motivos medidos em
# 24/08/2026. Primeiro, `ultimos/N` tem teto de 20 e devolve HTTP 400 acima
# disso ("A quantidade maxima de valores deve ser 20"), limite que o
# docs/DATA_SOURCES.md nao registra. Segundo, e o que de fato quebra: a serie
# 432 e publicada PARA FRENTE ate a vigencia da proxima reuniao do Copom, e em
# 24/08 os 20 ultimos valores iam de 28/08 a 16/09, todos futuros. Amarrar
# dataFinal em hoje devolve a meta em vigor hoje, com data de hoje.
SGS_URL = (
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
    "?formato=json&dataInicial={ini}&dataFinal={fim}"
)
SGS_META_SELIC = 432


def _fetch_ptax() -> tuple[dict | None, str | None]:
    """Dolar oficial de fechamento pelo PTAX. Devolve (dado, erro).

    Janela de 10 dias para atravessar fim de semana e feriado sem logica
    de calendario. A ultima cotacao da lista e a do ultimo dia com PTAX
    divulgado, que e exatamente o pregao encerrado que o briefing cita.
    """
    hoje = datetime.now(BRT).date()
    ini = (hoje - timedelta(days=10)).strftime("%m-%d-%Y")
    fim = hoje.strftime("%m-%d-%Y")
    data = get_json(PTAX_URL.format(ini=ini, fim=fim))
    if not data:
        return None, "PTAX: sem resposta do Olinda"
    valores = data.get("value") or []
    if not valores:
        return None, "PTAX: janela de 10 dias sem cotacao divulgada"

    ultimo = valores[-1]
    anterior = valores[-2] if len(valores) >= 2 else None
    try:
        venda = float(ultimo["cotacaoVenda"])
        trade_date = str(ultimo["dataHoraCotacao"])[:10]
    except (KeyError, TypeError, ValueError):
        return None, "PTAX: resposta sem cotacaoVenda ou dataHoraCotacao"

    prev = None
    if anterior:
        try:
            prev = float(anterior["cotacaoVenda"])
        except (KeyError, TypeError, ValueError):
            prev = None

    return {
        "close": venda,
        "trade_date": trade_date,
        "previous_close": prev,
        "change_percent": round((venda - prev) / prev * 100, 2) if prev else None,
    }, None


def _fetch_selic() -> tuple[dict | None, str | None]:
    """Meta Selic do Copom pela serie 432 do SGS. Devolve (dado, erro).

    A janela termina em hoje de proposito, ver o comentario de SGS_URL: a
    serie e publicada para frente e o ultimo item bruto tem data futura, o
    que daria trade_date no futuro e quebraria a ancoragem da REGRA 6.
    Sessenta dias para tras garantem pegar o patamar anterior do Copom.
    """
    hoje = datetime.now(BRT).date()
    data = get_json(
        SGS_URL.format(
            codigo=SGS_META_SELIC,
            ini=(hoje - timedelta(days=60)).strftime("%d/%m/%Y"),
            fim=hoje.strftime("%d/%m/%Y"),
        )
    )
    if not data:
        return None, "SGS 432: sem resposta"
    if not isinstance(data, list) or not data:
        return None, "SGS 432: resposta vazia ou fora do formato de lista"

    passados: list[tuple[str, float]] = []
    for item in data:
        try:
            dia, mes, ano = str(item["data"]).split("/")
            d = date(int(ano), int(mes), int(dia))
            valor = float(item["valor"])
        except (KeyError, TypeError, ValueError):
            continue
        if d <= hoje:
            passados.append((d.isoformat(), valor))

    if not passados:
        return None, "SGS 432: janela de 60 dias so tem datas futuras"

    trade_date, valor = passados[-1]
    # Anterior util e o ultimo valor DIFERENTE, ou seja o patamar anterior do
    # Copom. Comparar com o dia anterior nao diz nada, a serie e um degrau.
    prev = next((v for _, v in reversed(passados[:-1]) if v != valor), None)

    return {
        "close": valor,
        "trade_date": trade_date,
        "previous_close": prev,
        "change_percent": None,  # juro nao se compara em %, se compara em bp
    }, None


def _quorum(ticker: str, principal: dict, secundaria: dict | None) -> dict:
    """Fecha o registro do ativo, cruzando fonte principal com a secundaria.

    Duas fontes independentes concordando dentro da tolerancia do ativo dao
    quorum "ok". Divergencia acima da tolerancia marca "divergencia", e o
    validador trata como motivo de reprovacao: se as duas fontes discordam,
    nao ha numero confiavel para conferir o briefing contra.

    Ativo com uma fonte so fica "fonte_unica". Nao e erro, e um rotulo
    honesto: o portao ainda pega fabricacao grosseira, mas nao pega feed
    quebrado, porque nao ha com o que comparar.
    """
    meta = ATIVOS_META.get(ticker, {})
    registro = dict(principal)
    registro["classe"] = meta.get("classe")
    registro["unidade"] = meta.get("unidade")
    registro["tolerancia"] = meta.get("tolerancia")

    if not secundaria or not secundaria.get("close"):
        registro["quorum"] = "fonte_unica"
        return registro

    a = principal["close"]
    b = secundaria["close"]
    if not a:
        registro["quorum"] = "fonte_unica"
        return registro

    divergencia = abs(a - b) / abs(a) * 100
    registro["divergencia_pct"] = round(divergencia, 3)
    registro["fonte_secundaria"] = secundaria
    tol = meta.get("tolerancia") or 1.0
    if meta.get("unidade") == "bp":
        registro["quorum"] = "ok" if abs(a - b) * 100 <= tol else "divergencia"
    else:
        registro["quorum"] = "ok" if divergencia <= tol else "divergencia"
    return registro


def main(argv: list[str]) -> int:
    data_tag = date.today().strftime("%Y%m%d")
    if len(argv) > 1 and argv[1].isdigit() and len(argv[1]) == 8:
        data_tag = argv[1]

    erros: list[str] = []
    ativos: dict[str, dict] = {}

    yahoo, erros_yahoo = fetch_yahoo_fechamentos(YAHOO_SYMBOLS)
    erros.extend(erros_yahoo)

    ptax, erro_ptax = _fetch_ptax()
    if erro_ptax:
        erros.append(erro_ptax)
    selic, erro_selic = _fetch_selic()
    if erro_selic:
        erros.append(erro_selic)

    for ticker, dado in yahoo.items():
        if ticker == "USDBRL":
            continue  # tratado abaixo, com PTAX mandando
        registro = _quorum(ticker, dado, None)
        registro["fonte"] = f"Yahoo Finance ({dado.get('simbolo')})"
        ativos[ticker] = registro

    # USD/BRL: PTAX e a taxa de referencia oficial, Yahoo entra como segunda
    # opiniao. Elas divergem de forma legitima, PTAX e fixing das 13h e o
    # Yahoo e spot de 24h, por isso a tolerancia de cambio e 1% e nao 0,1%.
    y_usd = yahoo.get("USDBRL")
    if ptax:
        registro = _quorum("USDBRL", ptax, y_usd)
        registro["fonte"] = "BCB PTAX (Olinda), venda"
        if y_usd:
            registro["fonte_secundaria"]["fonte"] = f"Yahoo Finance ({y_usd.get('simbolo')})"
        ativos["USDBRL"] = registro
    elif y_usd:
        registro = _quorum("USDBRL", y_usd, None)
        registro["fonte"] = f"Yahoo Finance ({y_usd.get('simbolo')}), PTAX indisponivel"
        ativos["USDBRL"] = registro

    if selic:
        registro = _quorum("SELIC", selic, None)
        registro["fonte"] = "BCB SGS serie 432 (meta Selic Copom)"
        ativos["SELIC"] = registro

    saida = {
        "coletado_em": datetime.now(BRT).isoformat(),
        "data_coleta": data_tag,
        "n_ativos": len(ativos),
        "ativos": ativos,
        "erros": erros,
    }

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    destino = LOG_DIR / f"precos_{data_tag}.json"
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")

    divergentes = [t for t, v in ativos.items() if v.get("quorum") == "divergencia"]
    print(f">>> {destino.name}: {len(ativos)} ativos, {len(erros)} erro(s)")
    if divergentes:
        print(f"    DIVERGENCIA entre fontes: {', '.join(divergentes)}")
    for e in erros:
        print(f"    erro: {e}")

    # Sem nenhum ativo nao ha portao numerico possivel. Falha fechada: a
    # REGRA 6 vai reprovar o briefing, e o exit != 0 deixa isso legivel no
    # log em vez de virar arquivo vazio que ninguem percebe.
    if not ativos:
        print("ERRO: nenhuma cotacao coletada, portao numerico ficaria cego.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

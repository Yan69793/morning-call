"""gravar_visao.py — registro diario das chamadas direcionais do briefing.

Criado em 24/08/2026. Objetivo unico: acumular a materia-prima do track
record. Nao julga, nao compara com realizado, nao gera relatorio. So grava o
que o briefing afirmou, no dia em que afirmou.

Por que rodar todo dia desde ja, mesmo sem uso imediato: chamada direcional
nao tem backfill honesto. Ou foi registrada no dia, ou nao existe mais.

Grava tambem o dia SEM briefing, com motivo. Sem isso a serie so tem os dias
em que o cron funcionou, e "acertei 6 de 10" fica indistinguivel de "rodei em
10 dos 18 dias uteis e registrei os 10 que rodaram". Isso e vies de selecao e
nao da para limpar depois.

Reaproveita os extratores do validar_briefing.py de proposito. Copiar o regex
criaria drift entre o que o portao exige e o que o historico mede, e ai as
duas medidas divergem sem ninguem perceber.

Uso:
    python scripts/gravar_visao.py outputs/briefing_YYYYMMDD.html
    python scripts/gravar_visao.py --sem-briefing YYYYMMDD "fim de semana"
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

from _comum import ATIVOS_ALIASES, BRT
from validar_briefing import (
    CONFIANCA_PATTERN,
    _find_directional_paragraphs,
    _load_json,
    _normalizar,
)

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
VISAO_DIR = ROOT / "visao"

# Direcao inferida do proprio trecho. Grosseiro de proposito: o objetivo e
# permitir contagem futura de acerto, nao classificar semantica fina. Trecho
# ambiguo fica "indefinida" e sai da conta em vez de entrar com palpite.
ALTA = re.compile(
    r"\b(subir|valorizar|avancar|alta|altista|positiv\w+|"
    r"revisao para cima|pressao de compra)\b"
)
BAIXA = re.compile(
    r"\b(cair|desvalorizar|recuar|baixa|baixista|negativ\w+|queda|"
    r"revisao para baixo|pressao de venda)\b"
)


def _direcao(trecho: str) -> str:
    t = _normalizar(trecho)
    tem_alta = bool(ALTA.search(t))
    tem_baixa = bool(BAIXA.search(t))
    if tem_alta and not tem_baixa:
        return "alta"
    if tem_baixa and not tem_alta:
        return "baixa"
    return "indefinida"


def _ativos_no_trecho(trecho: str) -> list[str]:
    t = _normalizar(trecho)
    achados = []
    for ticker, aliases in ATIVOS_ALIASES.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(_normalizar(alias))}\b", t):
                achados.append(ticker)
                break
    return achados


def _confianca_do_trecho(trecho: str) -> float | None:
    m = CONFIANCA_PATTERN.search(trecho)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def _gravar(data_tag: str, payload: dict) -> Path:
    VISAO_DIR.mkdir(parents=True, exist_ok=True)
    iso = f"{data_tag[:4]}-{data_tag[4:6]}-{data_tag[6:]}"
    destino = VISAO_DIR / f"{iso}.json"
    payload["data"] = iso
    payload["gravado_em"] = datetime.now(BRT).isoformat()
    destino.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return destino


def registrar_sem_briefing(data_tag: str, motivo: str) -> Path:
    return _gravar(data_tag, {"houve_briefing": False, "motivo": motivo, "chamadas": []})


def registrar_briefing(html_path: Path) -> Path:
    html = html_path.read_text(encoding="utf-8")
    m = re.search(r"(\d{8})", html_path.stem)
    data_tag = m.group(1) if m else date.today().strftime("%Y%m%d")

    precos = _load_json(LOG_DIR / f"precos_{data_tag}.json") or {}
    ativos_precos = precos.get("ativos", {})

    chamadas = []
    for trecho in _find_directional_paragraphs(html):
        tickers = _ativos_no_trecho(trecho)
        chamadas.append(
            {
                "trecho": trecho,
                "direcao": _direcao(trecho),
                "confianca": _confianca_do_trecho(trecho),
                "ativos": tickers,
                # Referencia congelada no dia. Sem isso o comparador futuro
                # teria que reconstruir qual era o nivel na data, que e
                # justamente o tipo de reconstrucao que produz erro de um dia.
                "referencia": {
                    t: {
                        "close": ativos_precos.get(t, {}).get("close"),
                        "trade_date": ativos_precos.get(t, {}).get("trade_date"),
                    }
                    for t in tickers
                    if t in ativos_precos
                },
            }
        )

    return _gravar(
        data_tag,
        {
            "houve_briefing": True,
            "arquivo": html_path.name,
            "n_chamadas": len(chamadas),
            "chamadas": chamadas,
        },
    )


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "--sem-briefing":
        if len(argv) < 3:
            print("Uso: gravar_visao.py --sem-briefing YYYYMMDD [motivo]", file=sys.stderr)
            return 2
        motivo = argv[3] if len(argv) > 3 else "nao informado"
        destino = registrar_sem_briefing(argv[2], motivo)
        print(f">>> {destino.name}: sem briefing ({motivo})")
        return 0

    if len(argv) < 2:
        print("Uso: gravar_visao.py outputs/briefing_YYYYMMDD.html", file=sys.stderr)
        return 2

    html_path = Path(argv[1])
    if not html_path.exists():
        print(f"ERRO: arquivo nao encontrado: {html_path}", file=sys.stderr)
        return 3

    destino = registrar_briefing(html_path)
    dados = json.loads(destino.read_text(encoding="utf-8"))
    print(f">>> {destino.name}: {dados['n_chamadas']} chamada(s) direcional(is)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

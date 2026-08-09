"""coletar_estado.py — coleta o estado de cada sistema monitorado.

Faz GET nos workers do Morning Call, Radar Quant e VixRadar.
Detecta staleness (dado com marketDate anterior ao ultimo pregao).
Se Radar Quant > 2 dias stale, tenta Yahoo Finance como fallback.
Le projetos-exposicao.json para o mapa de impacto.

Zero dependencia externa. So stdlib.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BRT = timezone(timedelta(hours=-3))

# Ativos do Radar Quant que o briefing quer acompanhar
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


def _load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _get_json(url: str, timeout: int = 20) -> dict | None:
    """GET JSON de um worker. Retorna None em qualquer erro."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _ultimo_pregao(ref_date: date | None = None) -> date:
    """Calcula o ultimo dia util (seg-sex, sem verificacao de feriado B3).

    O calendario B3 completo esta em feriados-b3.json e e usado pelo
    run_briefing.ps1 para decidir se roda. Aqui usamos uma heuristica
    simples (dia util = seg a sex) para o calculo de staleness, porque
    um falso positivo (marcar como stale num feriado) e menos grave
    que um falso negativo (deixar passar dado velho).
    """
    d = ref_date or date.today()
    while d.weekday() >= 5:  # sabado ou domingo
        d -= timedelta(days=1)
    return d


def _fetch_yahoo(symbols: dict[str, str]) -> dict[str, dict]:
    """Busca OHLCV basico no Yahoo Finance v8 chart API.

    Sem auth, sem cookie, sem crumb. So User-Agent.
    Devolve {ticker: {price, previousClose, changePercent, date}}.
    """
    results: dict[str, dict] = {}
    for ticker, yahoo_symbol in symbols.items():
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}"
            "?interval=1d&range=5d"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
        except Exception:
            continue

        try:
            result = data["chart"]["result"][0]
            meta = result["meta"]
            results[ticker] = {
                "price": meta.get("regularMarketPrice"),
                "previousClose": meta.get("chartPreviousClose"),
                "changePercent": (
                    round(
                        (meta["regularMarketPrice"] - meta["chartPreviousClose"])
                        / meta["chartPreviousClose"]
                        * 100,
                        2,
                    )
                    if meta.get("regularMarketPrice") and meta.get("chartPreviousClose")
                    else None
                ),
                "date": date.today().isoformat(),
                "fonte": "Yahoo Finance (fallback — scan esta fora do ar)",
            }
        except (KeyError, IndexError, TypeError):
            continue

    return results


def _calc_staleness(market_date_str: str | None, ref_date: date) -> dict:
    """Calcula dias de atraso e se esta stale.

    Retorna {stale, dias_atraso, market_date, ultimo_pregao}.
    """
    ultimo = _ultimo_pregao(ref_date)
    if not market_date_str:
        return {
            "stale": True,
            "dias_atraso": None,
            "market_date": None,
            "ultimo_pregao": ultimo.isoformat(),
            "motivo": "sem marketDate na resposta",
        }

    try:
        md = date.fromisoformat(market_date_str)
    except (ValueError, TypeError):
        return {
            "stale": True,
            "dias_atraso": None,
            "market_date": market_date_str,
            "ultimo_pregao": ultimo.isoformat(),
            "motivo": f"marketDate invalido: {market_date_str}",
        }

    dias = (ref_date - md).days
    return {
        "stale": dias > 0,
        "dias_atraso": dias,
        "market_date": market_date_str,
        "ultimo_pregao": ultimo.isoformat(),
    }


def _consecutive_stale_days(current_date: str, system: str) -> int:
    """Le o log de estado de ontem para contar dias consecutivos de staleness."""
    hoje = date.fromisoformat(current_date)
    ontem = (hoje - timedelta(days=1)).strftime("%Y%m%d")
    ontem_path = LOG_DIR / f"estado_{ontem}.json"
    data = _load_json(ontem_path)
    if not data:
        return 1
    system_data = data.get("sistemas", {}).get(system, {})
    staleness = system_data.get("staleness", {})
    if staleness.get("stale"):
        prev_days = staleness.get("dias_consecutivos", 1)
        return prev_days + 1
    return 1


def main() -> int:
    hoje = date.today()
    date_tag = hoje.strftime("%Y%m%d")

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== Coletando estado dos sistemas para {date_tag} ===")

    sistemas: dict[str, dict] = {}

    # --- Morning Call ---
    print("\n[Morning Call]")
    mc_url = os.environ.get(
        "MORNING_CALL_URL",
        "https://morning-call.prospects-intel.workers.dev/api/report/latest",
    )
    mc = _get_json(mc_url)
    if mc and mc.get("ok"):
        sistemas["morning-call"] = {
            "ok": True,
            "trade_date": mc.get("trade_date"),
            "regime": mc.get("regime"),
            "vies": mc.get("vies"),
            "conviccao": mc.get("conviccao"),
            "n_trades": mc.get("n_trades"),
            "aprovado": mc.get("aprovado"),
            "data_coleta": datetime.now(tz=BRT).isoformat(),
        }
        print(f"  OK: trade_date={mc.get('trade_date')}, regime={mc.get('regime')}, vies={mc.get('vies')}")
    else:
        sistemas["morning-call"] = {"ok": False, "erro": "sem resposta ou invalido"}
        print("  FALHOU: sem resposta do worker")

    # --- Radar Quant ---
    print("\n[Radar Quant]")
    rq_url = os.environ.get(
        "RADAR_QUANT_URL",
        "https://radar-quant-brasil.prospects-intel.workers.dev/api/radar/latest",
    )
    rq = _get_json(rq_url)
    if rq and rq.get("marketDate"):
        market_date = rq.get("marketDate")
        staleness = _calc_staleness(market_date, hoje)
        dias_cons = _consecutive_stale_days(date_tag, "radar-quant") if staleness["stale"] else 0
        staleness["dias_consecutivos"] = dias_cons

        sistemas["radar-quant"] = {
            "ok": True,
            "staleness": staleness,
            "n_items": len(rq.get("items", [])),
            "schema_version": rq.get("schemaVersion"),
            "data_coleta": datetime.now(tz=BRT).isoformat(),
        }
        status = "STALE" if staleness["stale"] else "FRESCO"
        print(f"  OK: marketDate={market_date} ({status}, {staleness['dias_atraso']}d atraso, {dias_cons}d consecutivos)")

        # Yahoo Finance fallback se > 2 dias stale
        if staleness["stale"] and staleness.get("dias_atraso", 0) >= 2:
            print("  >>> Staleness >= 2 dias. Buscando Yahoo Finance...")
            yahoo_data = _fetch_yahoo(YAHOO_SYMBOLS)
            sistemas["radar-quant"]["yahoo_fallback"] = {
                "acionado": True,
                "n_simbolos": len(yahoo_data),
                "dados": yahoo_data,
            }
            print(f"  Yahoo Finance: {len(yahoo_data)}/{len(YAHOO_SYMBOLS)} simbolos obtidos")
    else:
        sistemas["radar-quant"] = {
            "ok": False,
            "erro": "sem resposta ou invalido",
            "data_coleta": datetime.now(tz=BRT).isoformat(),
        }
        print("  FALHOU: sem resposta do worker")

    # --- VixRadar ---
    print("\n[VixRadar]")
    vx_url = os.environ.get(
        "VIXRADAR_URL",
        "https://radar-credito-api.prospects-intel.workers.dev",
    )
    vx = _get_json(vx_url, timeout=15)
    if vx:
        sistemas["vixradar"] = {
            "ok": True,
            "status": vx.get("status", "desconhecido"),
            "data_coleta": datetime.now(tz=BRT).isoformat(),
        }
        print(f"  OK: status={vx.get('status', '?')}")
    else:
        sistemas["vixradar"] = {"ok": False, "erro": "sem resposta do worker"}
        print("  FALHOU: sem resposta do worker")

    # --- Mapa de exposicao ---
    exp_path = ROOT / "projetos-exposicao.json"
    exposicao = _load_json(exp_path) or {}

    # --- Salvar ---
    out_path = LOG_DIR / f"estado_{date_tag}.json"
    payload = {
        "coletado_em": datetime.now(tz=BRT).isoformat(),
        "data": date_tag,
        "sistemas": sistemas,
        "exposicao_resumo": {
            slug: {"nome": p["nome"], "exposicao": p["exposicao"]}
            for slug, p in exposicao.items()
        },
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nSalvo em: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

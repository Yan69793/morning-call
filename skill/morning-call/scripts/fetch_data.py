#!/usr/bin/env python3
"""Coletores determinísticos de referência (Python). Espelham src/data no Worker.

Cada função devolve dado COM proveniência: (valor, source, timestamp/as_of). Sem fonte -> None
e o chamador marca "N/D — REQUER VERIFICAÇÃO". Só stdlib (urllib) para não exigir dependências.

Uso rápido (rede necessária):
    python3 fetch_data.py            # smoke test: BCB SGS ao vivo
    FRED_API_KEY=xxxx python3 fetch_data.py --fred DGS10
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "morning-call/0.1 (+data-layer)"}


def _get_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def bcb_sgs_last(codigo: int, n: int = 1) -> dict:
    """Últimos N valores de uma série do SGS do BCB. Fonte pública, sem chave.
    Ex.: código 11 = Selic diária; 1 = USD/BRL PTAX venda; 432 = meta Selic."""
    url = (
        f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}"
        f"/dados/ultimos/{n}?formato=json"
    )
    data = _get_json(url)
    last = data[-1] if data else None
    return {
        "codigo": codigo,
        "value": float(last["valor"]) if last else None,
        "as_of": last["data"] if last else None,  # dd/MM/aaaa
        "source": "BCB/SGS",
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "status": "OK" if last else "ND",
    }


def fred_series_last(series_id: str, api_key: str | None = None) -> dict:
    """Último valor de uma série do FRED. Requer FRED_API_KEY (gratuita)."""
    api_key = api_key or os.environ.get("FRED_API_KEY")
    if not api_key:
        return {"series_id": series_id, "value": None, "status": "ND",
                "source": "FRED", "note": "FRED_API_KEY ausente"}
    url = (
        f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}"
        f"&api_key={api_key}&file_type=json&sort_order=desc&limit=1"
    )
    data = _get_json(url)
    obs = data.get("observations", [])
    last = obs[0] if obs else None
    val = None
    if last and last.get("value") not in (None, ".", ""):
        val = float(last["value"])
    return {
        "series_id": series_id,
        "value": val,
        "as_of": last["date"] if last else None,
        "source": "FRED",
        "url": url.replace(api_key, "***"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "status": "OK" if val is not None else "ND",
    }


def us_par_yield_curve_url(year: int) -> str:
    """URL do feed XML oficial da par yield curve (CMT) do US Treasury."""
    return (
        "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        f"pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={year}"
    )


def _smoke() -> None:
    print("BCB SGS 11 (Selic diária):", json.dumps(bcb_sgs_last(11), ensure_ascii=False))
    print("BCB SGS 1  (USD/BRL venda):", json.dumps(bcb_sgs_last(1), ensure_ascii=False))
    fk = os.environ.get("FRED_API_KEY")
    if fk and "--fred" in sys.argv:
        sid = sys.argv[sys.argv.index("--fred") + 1]
        print("FRED", sid, json.dumps(fred_series_last(sid), ensure_ascii=False))
    else:
        print("FRED: defina FRED_API_KEY e passe --fred DGS10 para testar.")
    print("US par yield curve XML:", us_par_yield_curve_url(datetime.now().year))


if __name__ == "__main__":
    _smoke()

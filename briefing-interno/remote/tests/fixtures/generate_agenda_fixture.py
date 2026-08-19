"""generate_agenda_fixture.py — gera o golden de paridade da agenda.

RODAR UMA VEZ (ou quando as tabelas 2027 entrarem): captura os items crus da
API IBGE para os meses civis da janela representativa e gera, com o proprio
agenda_agent.py (via monkeypatch da rede), o payload esperado para cada data
representativa. O teste TS (agenda.parity.test.mjs) compara a porta contra
este golden. Divergencia = falha de build, nao publicar.

Uso: python tests/fixtures/generate_agenda_fixture.py
Saida: tests/fixtures/agenda_golden.json
"""

import json
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

AGENTS_DIR = Path(r"E:\Diretorio\Claude\FREQUENTE\Site\automacao-yan-os\agents")
sys.path.insert(0, str(AGENTS_DIR))

import agenda_agent  # noqa: E402

FIXTURE_DIR = Path(__file__).resolve().parent
OUT = FIXTURE_DIR / "agenda_golden.json"

# Janela representativa: todas as seg-sex de 2026-08-17 a 2026-10-09 (8 semanas,
# cobre Focus semanal, CPI/PPI/NFP/Retail de ago-set, COPOM+FOMC 17/09, ECB 10/09,
# BoJ 18/09, China LPR 21/09 e o rollover de fim de semana), + sab/dom.
MESES_CAPTURA = [(2026, 8), (2026, 9), (2026, 10)]
D0 = date(2026, 8, 17)
D1 = date(2026, 10, 9)
DATAS_REPRESENTATIVAS = []
cursor = D0
while cursor <= D1:
    if cursor.weekday() < 5:
        DATAS_REPRESENTATIVAS.append(cursor)
    cursor += timedelta(days=1)
DATAS_REPRESENTATIVAS += [date(2026, 9, 19), date(2026, 9, 20)]


class FakeResponse:
    def __init__(self, payload_bytes):
        self._data = payload_bytes

    class _Headers:
        def get(self, _k, _d=None):
            return None

    headers = _Headers()

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def capturar_ibge() -> dict:
    """Busca real na API IBGE para os meses civis da captura."""
    por_mes = {}
    for ano, mes in MESES_CAPTURA:
        mes_ini = f"{ano:04d}-{mes:02d}-01"
        if mes == 12:
            mes_fim = f"{ano:04d}-12-31"
        else:
            ultimo = (date(ano, mes + 1, 1) - timedelta(days=1)).isoformat()
            mes_fim = ultimo
        url = (
            "https://servicodados.ibge.gov.br/api/v3/calendario/"
            f"?de={mes_ini}&ate={mes_fim}&qtd=100"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                import gzip
                raw = gzip.decompress(raw)
            data = json.loads(raw.decode("utf-8"))
        por_mes[f"{ano:04d}-{mes:02d}"] = data.get("items") or []
        print(f"IBGE {ano}-{mes:02d}: {len(por_mes[f'{ano:04d}-{mes:02d}'])} item(ns)")
    return por_mes


def main() -> int:
    por_mes = capturar_ibge()
    todos_items = []
    for items in por_mes.values():
        todos_items.extend(items)

    # Monkeypatch: urlopen serve os items capturados (o agenda_agent filtra
    # pela janela, como em producao). data_divulgacao e o unico campo usado.
    original_urlopen = urllib.request.urlopen

    def fake_urlopen(req, timeout=None):
        return FakeResponse(json.dumps({"items": todos_items}).encode("utf-8"))

    urllib.request.urlopen = fake_urlopen
    try:
        golden = {}
        for hoje in DATAS_REPRESENTATIVAS:
            payload = agenda_agent.gerar_agenda(hoje)
            payload["gerado"] = "FIXTURE"  # timestamp nao entra na paridade
            golden[hoje.isoformat()] = payload
    finally:
        urllib.request.urlopen = original_urlopen

    out = {
        "capturado_em": date.today().isoformat(),
        "fonte": "agenda_agent.py (Site/automacao-yan-os/agents)",
        "ibge_months": por_mes,
        "ibge_all_items": todos_items,
        "dates": golden,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nGolden salvo em: {OUT}")
    print(f"Datas representativas: {len(golden)}")
    total_eventos = sum(len(p["eventos"]) for p in golden.values())
    print(f"Eventos no golden: {total_eventos}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

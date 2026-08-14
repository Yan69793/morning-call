"""_comum.py — helpers compartilhados dos scripts do briefing-interno.

Criado em 14/08/2026 para o achado I01 do PENDENCIAS.md: o coletar_estado.py
lia as URLs dos workers so de os.environ e ignorava o .env. Os scripts
existentes ainda tem copias locais de load_env/load_json (achado A01); a
migracao para este modulo deve acontecer um script por vez, sem pressa.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


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

"""alertar.py — envia alerta simples via Resend quando o watchdog detecta falha.

Uso: python scripts/alertar.py "mensagem de alerta"
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
BRT = timezone(timedelta(hours=-3))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
RESEND_API = "https://api.resend.com/emails"


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


def main(argv: list[str]) -> int:
    mensagem = argv[1] if len(argv) > 1 else "Alerta do Briefing Matinal"

    env = _load_env()
    api_key = env.get("RESEND_API_KEY", "").strip()
    from_email = env.get("FROM_EMAIL", "").strip()
    to_email = env.get("TO_EMAIL", "").strip()

    if not api_key or not from_email or not to_email:
        print("ERRO: credenciais Resend ausentes no .env. Alerta NAO enviado.", file=sys.stderr)
        return 4

    hoje = date.today()
    data_tag = hoje.strftime("%Y%m%d")

    body = json.dumps({
        "from": from_email,
        "to": [to_email],
        "subject": f"ALERTA: Briefing Matinal {data_tag}",
        "text": mensagem,
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        RESEND_API,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": UA,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        print(f"Alerta enviado, Resend ID: {result.get('id', '?')}")
    except Exception as exc:
        print(f"ERRO ao enviar alerta: {exc}", file=sys.stderr)
        return 11

    # Registrar no log
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"briefing_{data_tag}.log"
    timestamp = datetime.now(tz=BRT).strftime("%Y-%m-%d %H:%M:%S")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"{timestamp} ALERTA_ENVIADO {mensagem}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

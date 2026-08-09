"""enviar_briefing.py — envia o briefing por email via Resend API.

Prevencao F03: chama validar_briefing.py ANTES de enviar, sempre.
So pula com --force e loga o motivo.

Uso:
    python scripts/enviar_briefing.py outputs/briefing_YYYYMMDD.html
    python scripts/enviar_briefing.py outputs/briefing_YYYYMMDD.html --force
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
OUTPUT_DIR = ROOT / "outputs"

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


def _validar(html_path: Path, force: bool = False) -> bool:
    """Chama validar_briefing.py. Retorna True se aprovado."""
    if force:
        print("--force: pulando validacao (F03 bypass registrado em log)")
        _log("ENVIADO_SEM_VALIDACAO", f"--force: {html_path}")
        return True

    validate_script = ROOT / "scripts" / "validar_briefing.py"
    if not validate_script.is_file():
        print("ERRO: validar_briefing.py nao encontrado. Envio abortado.", file=sys.stderr)
        return False

    print(">>> Validando antes de enviar (prevencao F03)...")
    proc = subprocess.run(
        [sys.executable, str(validate_script), str(html_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    print(proc.stdout)
    if proc.returncode != 0 or "REPROVADO" in proc.stdout:
        print("REPROVADO: briefing nao passou na validacao. Envio abortado.", file=sys.stderr)
        _log("REPROVADO_ENVIO_ABORTADO", str(html_path))
        return False

    print("APROVADO: prosseguindo com envio")
    return True


def _idempotency_check(data_tag: str, force: bool = False) -> bool:
    """Verifica sentinela de idempotencia. Retorna True se ja foi enviado."""
    sentinel = LOG_DIR / f"sent_{data_tag}.flag"
    if sentinel.exists() and not force:
        print(f"AVISO: briefing {data_tag} ja foi enviado ({sentinel}). Use --force para reenviar.")
        return True
    return False


def _send_resend(
    html_path: Path,
    api_key: str,
    from_email: str,
    to_email: str,
    data_tag: str,
) -> bool:
    """Envia via Resend API (HTTP POST, nao SMTP).

    Retorna True se enviado com sucesso.
    """
    html_content = html_path.read_text(encoding="utf-8")

    # Formatar a data para o subject
    try:
        data_obj = datetime.strptime(data_tag, "%Y%m%d").date()
        meses = [
            "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]
        data_fmt = f"{data_obj.day:02d} de {meses[data_obj.month - 1]} de {data_obj.year}"
    except ValueError:
        data_fmt = data_tag

    body = json.dumps({
        "from": from_email,
        "to": [to_email],
        "subject": f"Briefing Matinal — {data_fmt}",
        "html": html_content,
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
    except urllib.error.HTTPError as exc:
        corpo = ""
        try:
            corpo = exc.read().decode("utf-8", "replace")[:500]
        except Exception:
            corpo = "(corpo indisponivel)"
        print(f"ERRO Resend HTTP {exc.code}: {corpo}", file=sys.stderr)
        return False
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"ERRO Resend rede: {exc}", file=sys.stderr)
        return False

    email_id = result.get("id", "?")
    print(f"OK: email enviado, Resend ID: {email_id}")
    return True


def _log(status: str, detail: str) -> None:
    """Log de envio no log do dia."""
    hoje = date.today()
    data_tag = hoje.strftime("%Y%m%d")
    log_path = LOG_DIR / f"briefing_{data_tag}.log"
    timestamp = datetime.now(tz=BRT).strftime("%Y-%m-%d %H:%M:%S")
    line = f"{timestamp} ENVIAR_BRIEFING {status} {detail}\n"
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(line)
    if status == "ENVIADO_OK":
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} ENVIADO OK {detail}\n")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Uso: python scripts/enviar_briefing.py outputs/briefing_YYYYMMDD.html [--force]", file=sys.stderr)
        return 2

    html_path = Path(argv[1])
    force = "--force" in argv

    if not html_path.exists():
        print(f"ERRO: arquivo nao encontrado: {html_path}", file=sys.stderr)
        return 3

    # Extrair data do nome do arquivo
    date_match = re.search(r"(\d{8})", html_path.stem)
    data_tag = date_match.group(1) if date_match else date.today().strftime("%Y%m%d")

    # Idempotencia
    if _idempotency_check(data_tag, force):
        if not force:
            return 0

    # Validacao (F03 prevencao)
    if not _validar(html_path, force):
        return 9

    # Enviar
    env = _load_env()
    api_key = env.get("RESEND_API_KEY", "").strip()
    from_email = env.get("FROM_EMAIL", "").strip()
    to_email = env.get("TO_EMAIL", "").strip()

    if not api_key:
        print("ERRO: RESEND_API_KEY ausente no .env", file=sys.stderr)
        return 4
    if not from_email:
        print("ERRO: FROM_EMAIL ausente no .env", file=sys.stderr)
        return 4
    if not to_email:
        print("ERRO: TO_EMAIL ausente no .env", file=sys.stderr)
        return 4

    print(f">>> Enviando briefing {data_tag} para {to_email}...")

    if _send_resend(html_path, api_key, from_email, to_email, data_tag):
        _log("ENVIADO_OK", str(html_path))
        # Gravar sentinela
        sentinel = LOG_DIR / f"sent_{data_tag}.flag"
        sentinel.write_text(datetime.now(tz=BRT).isoformat())
        return 0
    else:
        _log("ENVIO_FALHOU", str(html_path))
        return 11


if __name__ == "__main__":
    sys.exit(main(sys.argv))

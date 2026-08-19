"""claim_remote.py — integracao Local com o estado remoto do Worker.

Best-effort por construcao: worker inacessivel, chave ausente ou erro de rede
= o pipeline Local segue exatamente como sempre (exit 2). O Remote nunca e
requisito para o Local funcionar.

Uso:
  python claim_remote.py --claim YYYYMMDD
      Reivindica o dia no Durable Object remoto. Exit 0 sempre que o estado
      ficou definido. O veredito detalhado fica em logs/claim_remote_YYYYMMDD.json
      (status: claimed | ja_enviado | ja_reservado | bloqueado | inacessivel).
  python claim_remote.py --complete YYYYMMDD
      Registra o envio local no estado remoto (melhor esforco, silencioso).
  python claim_remote.py --status YYYYMMDD
      Consulta o estado remoto. Exit: 0 = sent, 1 = processing, 2 = worker
      inacessivel, 3 = falhou/ausente.

Config no .env:
  BRIEFING_REMOTE_URL / FECHAMENTO_REMOTE_URL  (opcional, default workers.dev)
  LOCAL_CLAIM_KEY                              (secret compartilhado com o Worker)
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
BRT = timezone(timedelta(hours=-3))
UA = "SzuchmacherClaimRemote/1.0"

# Reserva local: maior que o pior caso do pipeline (briefing com 3 geracoes,
# fechamento com pre-flight + geracao + envio). O worker remoto usa TTL proprio
# mais curto com renovacao por heartbeat.
TTL_MS_BRIEFING = 25 * 60 * 1000
TTL_MS_FECHAMENTO = 30 * 60 * 1000

DEFAULT_URLS = {
    "briefing-interno": "https://sz-briefing-remote.prospects-intel.workers.dev",
    "relatorio-diario-szuchmacher": "https://sz-fechamento-remote.prospects-intel.workers.dev",
}


def _projeto() -> str:
    return ROOT.name


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


def _remote_url(env: dict[str, str]) -> str:
    projeto = _projeto()
    if projeto == "relatorio-diario-szuchmacher":
        return env.get("FECHAMENTO_REMOTE_URL", "").strip() or DEFAULT_URLS[projeto]
    return env.get("BRIEFING_REMOTE_URL", "").strip() or DEFAULT_URLS.get(projeto, "")


def _ttl_ms() -> int:
    if _projeto() == "relatorio-diario-szuchmacher":
        return TTL_MS_FECHAMENTO
    return TTL_MS_BRIEFING


def _result_path(date_tag: str) -> Path:
    return LOG_DIR / f"claim_remote_{date_tag}.json"


def _gravar_resultado(date_tag: str, payload: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    _result_path(date_tag).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _request(url: str, method: str, key: str, payload: dict | None, timeout: int = 15):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            "x-local-claim-key": key,
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def cmd_claim(date_tag: str, env: dict[str, str]) -> int:
    key = env.get("LOCAL_CLAIM_KEY", "").strip()
    url = _remote_url(env)
    if not key or not url:
        _gravar_resultado(date_tag, {"status": "inacessivel", "motivo": "LOCAL_CLAIM_KEY ou URL ausente no .env"})
        print(json.dumps({"status": "inacessivel"}))
        return 2

    run_id = uuid.uuid4().hex
    try:
        resp = _request(
            f"{url.rstrip('/')}/claim",
            "POST",
            key,
            {
                "date": date_tag,
                "claimant": "local",
                "run_id": run_id,
                "ttl_ms": _ttl_ms(),
            },
        )
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        _gravar_resultado(date_tag, {"status": "inacessivel", "motivo": str(exc)[:200]})
        print(json.dumps({"status": "inacessivel"}))
        return 2

    if resp.get("granted"):
        resultado = {"status": "claimed", "run_id": run_id, "attempts": resp.get("attempts")}
    else:
        razao = resp.get("reason") or "bloqueado"
        resultado = {"status": razao, "holder": resp.get("holder")}
    _gravar_resultado(date_tag, resultado)
    print(json.dumps(resultado, ensure_ascii=False))
    return 0


def cmd_complete(date_tag: str, env: dict[str, str]) -> int:
    key = env.get("LOCAL_CLAIM_KEY", "").strip()
    url = _remote_url(env)
    if not key or not url:
        return 2
    path = _result_path(date_tag)
    run_id = None
    if path.is_file():
        try:
            run_id = json.loads(path.read_text(encoding="utf-8")).get("run_id")
        except (json.JSONDecodeError, OSError):
            run_id = None
    if not run_id:
        print(json.dumps({"status": "sem_claim", "motivo": "sem run_id local para completar"}))
        return 0
    try:
        resp = _request(
            f"{url.rstrip('/')}/complete",
            "POST",
            key,
            {
                "date": date_tag,
                "claimant": "local",
                "run_id": run_id,
                "update": {
                    "status": "sent",
                    "delivery_status": "enviado",
                    "validation_status": "aprovado",
                    "idempotency_status": "enviado",
                },
            },
        )
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        print(json.dumps({"status": "inacessivel", "motivo": str(exc)[:200]}))
        return 2
    print(json.dumps({"status": "ok" if resp.get("ok") else resp.get("reason")}, ensure_ascii=False))
    return 0


def cmd_status(date_tag: str, env: dict[str, str]) -> int:
    key = env.get("LOCAL_CLAIM_KEY", "").strip()
    url = _remote_url(env)
    if not key or not url:
        return 2
    try:
        resp = _request(f"{url.rstrip('/')}/state?date={date_tag}", "GET", key, None)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError):
        return 2
    estado = resp.get("state")
    if estado and estado.get("status") == "sent":
        print(json.dumps({"status": "sent", "execution_mode": estado.get("execution_mode")}, ensure_ascii=False))
        return 0
    if estado and estado.get("status") == "processing":
        print(json.dumps({"status": "processing"}, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "falhou_ou_ausente"}, ensure_ascii=False))
    return 3


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("Uso: python claim_remote.py --claim|--complete|--status YYYYMMDD", file=sys.stderr)
        return 2
    comando, date_tag = argv[1], argv[2]
    env = _load_env()
    if comando == "--claim":
        return cmd_claim(date_tag, env)
    if comando == "--complete":
        return cmd_complete(date_tag, env)
    if comando == "--status":
        return cmd_status(date_tag, env)
    print(f"comando desconhecido: {comando}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

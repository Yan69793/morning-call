"""enviar_briefing.py — envia o briefing por email via Resend API.

Prevencao F03: chama validar_briefing.py ANTES de enviar, sempre.
So pula com --force e loga o motivo.

Uso:
    python scripts/enviar_briefing.py outputs/briefing_YYYYMMDD.html
    python scripts/enviar_briefing.py outputs/briefing_YYYYMMDD.html --force
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "logs"
OUTPUT_DIR = ROOT / "outputs"

BRT = timezone(timedelta(hours=-3))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
RESEND_API = "https://api.resend.com/emails"


def _load_env(env_path: Path | None = None) -> dict[str, str]:
    if env_path is None:
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


# .env do Fechamento de Mercado, fonte da lista de clientes no modo --clientes
FECHAMENTO_ENV = ROOT.parent.parent / "relatorio-diario-szuchmacher" / ".env"


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


# ============================================================
# Re-estilizacao do briefing no envio (13/08/2026)
# O modelo gera conteudo sem estilo, e o visual do relatorio
# diario (paleta navy/dourado, tabelas + inline CSS, seguro para
# Outlook) e aplicado aqui, de forma deterministica, na hora de
# montar o e-mail. O arquivo em disco continua sem estilo, entao
# o validar_briefing.py segue trabalhando sobre o conteudo puro.
# ============================================================

class _BriefingContent(HTMLParser):
    """Extrai h1/h2/p/li do briefing gerado, preservando negrito e
    descartando o conteudo de links (fontes), que nao vai ao e-mail.

    O modelo as vezes escreve o conteudo como texto solto, sem <p> nem
    <li>. Esse texto vira paragrafo "bare" da secao, para nada sumir."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections = []  # [(titulo, [(tipo, dados)])]
        self._current = None
        self._stack = []
        self._a_depth = 0
        self._p_segments = None
        self._li_segments = None
        self._bare_segments = None

    def _flush_bare(self):
        if self._bare_segments and self._current is not None:
            self._current[1].append(("p", self._bare_segments))
        self._bare_segments = None

    def finish(self):
        """Flush do texto solto que sobrou no fim do documento."""
        self._flush_bare()

    def handle_starttag(self, tag, attrs):
        if tag in ("h1", "h2"):
            self._flush_bare()
            self._current = ["", []]
            self.sections.append(self._current)
            self._stack.append(tag)
        elif tag == "p" and self._current is not None:
            self._flush_bare()
            self._p_segments = []
            self._stack.append("p")
        elif tag == "li" and self._current is not None:
            self._flush_bare()
            self._li_segments = []
            self._stack.append("li")
        elif tag == "b" and self._current is not None:
            self._stack.append("b")
        elif tag == "a":
            self._a_depth += 1

    def handle_endtag(self, tag):
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()
        if tag == "a" and self._a_depth > 0:
            self._a_depth -= 1
        if tag == "p" and self._p_segments is not None:
            self._current[1].append(("p", self._p_segments))
            self._p_segments = None
        elif tag == "li" and self._li_segments is not None:
            self._current[1].append(("li", self._li_segments))
            self._li_segments = None

    def handle_data(self, data):
        if not data.strip():
            return
        if self._a_depth > 0 or self._current is None:
            return
        top = self._stack[-1] if self._stack else None
        if top in ("h1", "h2"):
            self._current[0] += data
            return
        if top == "p" and self._p_segments is not None:
            self._append(self._p_segments, data)
        elif top == "li" and self._li_segments is not None:
            self._append(self._li_segments, data)
        elif top == "b" or top is None:
            # Texto solto na secao (bare). O negrito marca o titulo do ponto.
            if self._bare_segments is None:
                self._bare_segments = []
            self._append(self._bare_segments, data)

    def _append(self, segments, data):
        bold = "b" in self._stack
        if segments and segments[-1][1] == bold:
            segments[-1] = (segments[-1][0] + data, bold)
        else:
            segments.append((data, bold))


_RADAR_RE = re.compile(r"^(.+?):\s*([\d.,]+)\s*\(var:\s*([+-][\d.,]+)%\)$")

_URLISH_RE = re.compile(r"^(https?://)?[a-zA-Z0-9./-]+\.[a-z]{2,}(/|$)")
_CONFIANCA_RE = re.compile(r"\s*\([^)]*confian[cç]a[^)]*\)", re.IGNORECASE)
# O modelo as vezes escreve "Confianca: 0.8." sem parenteses no fim do item
_CONFIANCA_SOLTA_RE = re.compile(r"\s*[Cc]onfian[cç]a\s*[:=]\s*\d+[.,]\d+\.?", re.IGNORECASE)


def _strip_fonte_e_confianca(texto):
    """Remove do e-mail a citacao de fonte (colchetes com URL) e o parentese
    de confianca. Pedido do Yan em 13/08. A remocao e so visual: o arquivo em
    disco mantem os dois, porque o validar_briefing.py depende deles (REGRA 1
    e REGRA 2). Colchetes que NAO parecem URL ficam (ex.: anotacao do
    fallback do Yahoo Finance)."""
    texto = _CONFIANCA_RE.sub("", texto)
    texto = _CONFIANCA_SOLTA_RE.sub("", texto)

    def repl(m):
        inner = m.group(1).strip()
        if _URLISH_RE.match(inner):
            return ""
        return m.group(0)

    return re.sub(r"\[([^\[\]]+)\]", repl, texto)


def _section_header_row(titulo):
    t = html.escape(titulo)
    up = "SUBIR" in titulo.upper()
    down = "DESCER" in titulo.upper()
    marker = ""
    if up or down:
        color = "#1a8a5c" if up else "#b33a3a"
        marker = (
            f'<td width="14" valign="middle" style="width:14px;">'
            f'<span style="display:inline-block;width:8px;height:8px;'
            f'background-color:{color};">&nbsp;</span></td>'
        )
    return (
        '<tr><td style="padding:26px 32px 4px;">'
        '<table role="presentation" width="100%" cellspacing="0" '
        'cellpadding="0" border="0">'
        f"<tr>{marker}"
        '<td style="font-family:Georgia,\'Times New Roman\',Times,serif;'
        'font-size:15px;font-weight:bold;color:#0a1428;line-height:22px;'
        'border-bottom:1px solid #92703a;padding-bottom:8px;">'
        f"{t}</td></tr></table></td></tr>"
    )


def _render_segments(segments):
    parts = []
    for texto, bold in segments:
        texto = html.escape(_strip_fonte_e_confianca(texto))
        if bold:
            parts.append(f'<strong style="color:#0a1428;">{texto}</strong>')
        else:
            parts.append(texto)
    return "".join(parts)


def _paragraph_row(segments):
    inner = _render_segments(segments)
    return (
        '<tr><td style="padding:12px 32px 2px;'
        "font-family:Georgia,'Times New Roman',Times,serif;"
        "font-size:14px;color:#1a2030;line-height:24px;"
        f'mso-line-height-rule:exactly;">{inner}</td></tr>'
    )


def _split_por_negrito(segments):
    """Divide um paragrafo bare nos pontos: cada segmento em negrito abre
    um ponto novo (o modelo marca o titulo do ponto com <b>)."""
    grupos = []
    atual = []
    for seg in segments:
        if seg[1] and atual:
            grupos.append(atual)
            atual = []
        atual.append(seg)
    if atual:
        grupos.append(atual)
    return grupos


def _numbered_row(numero, segments):
    # O modelo numera os pontos no proprio texto ("1. Titulo"). Tira o numero
    # do primeiro segmento para nao duplicar com o numero do e-mail.
    if segments:
        texto0, bold0 = segments[0]
        texto0 = re.sub(r"^\d+\.\s*", "", texto0, count=1)
        segments = [(texto0, bold0)] + segments[1:]
    inner = _render_segments(segments)
    return (
        '<tr><td style="padding:8px 32px 2px;'
        "font-family:Georgia,'Times New Roman',Times,serif;"
        "font-size:14px;color:#1a2030;line-height:24px;"
        'mso-line-height-rule:exactly;">'
        f'<span style="font-family:\'Courier New\',Courier,monospace;'
        f'font-size:11px;color:#92703a;">{numero}.</span>&nbsp;{inner}'
        "</td></tr>"
    )


def _radar_row(texto):
    """Morto desde 13/08 (secao RADAR QUANT removida). Mantido para o caso
    de a secao voltar."""
    texto = html.escape(texto)
    m = _RADAR_RE.match(texto)
    if not m:
        return _bullet_row([(texto, False)])
    symbol, value, var = m.groups()
    color = "#b33a3a" if var.startswith("-") else "#1a8a5c"
    return (
        '<tr><td style="padding:3px 32px;">'
        '<table role="presentation" width="100%" cellspacing="0" '
        'cellpadding="0" border="0"><tr>'
        '<td width="90" style="font-family:\'Courier New\',Courier,monospace;'
        f'font-size:11px;color:#0a1428;line-height:20px;">{symbol}</td>'
        '<td align="right" width="110" style="font-family:\'Courier New\','
        f'Courier,monospace;font-size:11px;color:#1a2030;line-height:20px;">{value}</td>'
        '<td align="right" style="font-family:\'Courier New\',Courier,monospace;'
        f'font-size:11px;color:{color};line-height:20px;">{var}%</td>'
        "</tr></table></td></tr>"
    )


def _bullet_row(segments):
    inner = _render_segments(segments)
    return (
        '<tr><td style="padding:6px 32px;'
        "font-family:Georgia,'Times New Roman',Times,serif;"
        "font-size:14px;color:#1a2030;line-height:24px;"
        f'mso-line-height-rule:exactly;">'
        f'<span style="color:#92703a;">&bull;</span>&nbsp;{inner}</td></tr>'
    )


def build_styled_email(html_content: str, data_fmt: str) -> str:
    """Monta o e-mail do briefing com a paleta do relatorio diario."""
    parser = _BriefingContent()
    parser.feed(html_content)
    parser.finish()

    # Secoes que o Yan tirou do briefing em 13/08. Se o modelo escrever
    # mesmo assim, nao aparecem no e-mail (o validador ja passou, entao
    # descartar aqui e so decisao de apresentacao).
    secoes_removidas = ("RADAR QUANT", "MORNING CALL")

    body_rows = []
    for titulo, itens in parser.sections:
        if any(s in titulo.upper() for s in secoes_removidas):
            continue
        if not itens:
            # Secao so de titulo (ex.: "Briefing Matinal - data" do h1).
            # O hero ja traz o titulo, nao repetir.
            continue
        body_rows.append(_section_header_row(titulo))
        numerado = "IMPORTA" in titulo.upper()
        n = 0
        for tipo, dados in itens:
            if tipo == "p" and numerado:
                # Texto solto do modelo vem como um paragrafo unico com os
                # titulos dos pontos em negrito. Cada negrito abre um ponto.
                for grupo in _split_por_negrito(dados):
                    n += 1
                    body_rows.append(_numbered_row(n, grupo))
            elif tipo == "p":
                body_rows.append(_paragraph_row(dados))
            elif tipo == "li" and numerado:
                n += 1
                body_rows.append(_numbered_row(n, dados))
            elif tipo == "li":
                body_rows.append(_bullet_row(dados))
    corpo = "\n".join(body_rows)

    return f"""<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Briefing Matinal, {html.escape(data_fmt)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef0f4;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef0f4" style="background-color:#eef0f4;">
<tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;">

  <!-- Hero -->
  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0a1428" style="background-color:#0a1428;">
      <tr><td height="3" bgcolor="#92703a" style="height:3px;line-height:3px;font-size:3px;background-color:#92703a;">&nbsp;</td></tr>
      <tr><td style="padding:24px 32px 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td width="48" valign="middle" style="width:48px;padding-right:14px;">
              <img src="https://szuchmacher.com.br/logo.png" width="40" height="40" alt="Szuchmacher Consultoria" style="display:block;border:0;width:40px;height:40px;">
            </td>
            <td valign="middle" style="font-family:Georgia,'Times New Roman',Times,serif;font-size:22px;font-weight:normal;color:#ffffff;line-height:28px;mso-line-height-rule:exactly;">
              Szuchmacher Consultoria
            </td>
            <td valign="middle" align="right" width="150" style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#d4b87a;line-height:16px;mso-line-height-rule:exactly;white-space:nowrap;">
              {html.escape(data_fmt)}
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:6px 32px 6px 62px;font-family:'Courier New',Courier,monospace;font-size:10px;color:#b8925a;line-height:14px;mso-line-height-rule:exactly;">
        PANORAMA DIARIO
      </td></tr>
      <tr><td style="padding:0 32px 24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;font-style:italic;color:#d8d8d8;line-height:23px;mso-line-height-rule:exactly;">
        O essencial dos mercados para começar o dia
      </td></tr>
      <tr><td height="1" bgcolor="#92703a" style="height:1px;line-height:1px;font-size:1px;background-color:#92703a;opacity:0.35;">&nbsp;</td></tr>
    </table>
  </td></tr>

  <!-- Corpo -->
{corpo}

  <!-- Rodape -->
  <tr><td style="padding:28px 32px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #d8dce3;">
      <tr><td align="center" style="padding-top:18px;padding-bottom:24px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:10px;color:#92703a;line-height:14px;">szuchmacher.com.br</span>
        <br>
        <span style="font-family:Georgia,'Times New Roman',Times,serif;font-size:10px;color:#5a6272;line-height:15px;">Material informativo, n&atilde;o constitui recomenda&ccedil;&atilde;o de investimento</span>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def build_plain_text(html_content: str) -> str:
    """Versao texto puro do briefing, para o fallback do e-mail."""
    texto = re.sub(r"<[^>]+>", " ", html_content)
    texto = html.unescape(texto)
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n\s*\n+", "\n\n", texto)
    return texto.strip()


def _send_resend(
    html_path: Path,
    api_key: str,
    from_email: str,
    to_email: str,
    data_tag: str,
    bcc_list: list[str] | None = None,
) -> bool:
    """Envia via Resend API (HTTP POST, nao SMTP).

    Com bcc_list, o envio e BCC real: o to aponta para o proprio remetente
    e a lista vai no campo bcc, para nenhum cliente ver o endereco do outro.

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

    # Conteudo puro vira o e-mail estilizado na paleta do relatorio diario,
    # com versao texto puro de fallback. O arquivo em disco nao muda.
    styled = build_styled_email(html_content, data_fmt)
    plain = build_plain_text(html_content)

    payload = {
        "from": from_email,
        "to": [from_email if bcc_list else to_email],
        "subject": f"Briefing Matinal — {data_fmt}",
        "html": styled,
        "text": plain,
    }
    if bcc_list:
        payload["bcc"] = bcc_list
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

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

    # Idempotencia (so para o envio interno; clientes tem sentinela propria)
    clientes = "--clientes" in argv
    if not clientes and _idempotency_check(data_tag, force):
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

    # Envio avulso para outro destinatario: --to email@x.com
    if "--to" in argv:
        idx = argv.index("--to")
        if idx + 1 < len(argv):
            to_email = argv[idx + 1].strip()

    if not api_key:
        print("ERRO: RESEND_API_KEY ausente no .env", file=sys.stderr)
        return 4
    if not from_email:
        print("ERRO: FROM_EMAIL ausente no .env", file=sys.stderr)
        return 4
    if not to_email:
        print("ERRO: TO_EMAIL ausente no .env", file=sys.stderr)
        return 4

    if clientes:
        # Modo clientes (14/08, teste de um dia aprovado pelo Yan):
        # so envia com o flag de aprovacao do dia, para a lista do
        # Fechamento em BCC real. Falha fechada, sem excecao.
        flag = LOG_DIR / f"aprovacao_clientes_{data_tag}.flag"
        if not flag.exists():
            print("SEM APROVACAO: envio a clientes abortado. Crie o flag de aprovacao.", file=sys.stderr)
            _log("CLIENTES_SEM_APROVACAO", str(html_path))
            return 3
        sentinel_clientes = LOG_DIR / f"sent_clientes_{data_tag}.flag"
        if sentinel_clientes.exists() and not force:
            print(f"AVISO: briefing {data_tag} ja foi enviado a clientes ({sentinel_clientes.name}).")
            return 0
        fech_env = _load_env(FECHAMENTO_ENV)
        lista: list[str] = []
        for k in ("RECIPIENT", "BCC"):
            for a in (fech_env.get(k, "") or "").split(","):
                a = a.strip()
                if a and a not in lista:
                    lista.append(a)
        if not lista:
            print("ERRO: lista de clientes vazia no .env do Fechamento.", file=sys.stderr)
            return 4
        from_clientes = fech_env.get("FROM_EMAIL", "").strip() or from_email
        print(f">>> Enviando briefing {data_tag} para clientes ({len(lista)} destinatarios, BCC real)...")
        if _send_resend(html_path, api_key, from_clientes, from_clientes, data_tag, bcc_list=lista):
            _log("CLIENTES_ENVIADO_OK", f"{len(lista)} destinatarios")
            sentinel_clientes.write_text(datetime.now(tz=BRT).isoformat())
            return 0
        _log("CLIENTES_ENVIO_FALHOU", str(html_path))
        return 11

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

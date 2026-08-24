// send/resend.js — porta de enviar_briefing.py (e-mail estilizado + Resend).
//
// O arquivo em disco continua sem estilo: build_styled_email aplica o visual
// navy/dourado na hora do envio, exatamente como o Python. O parser
// _BriefingContent (porta do HTMLParser com convert_charrefs) preserva o
// bugfix de 17/08: <a> transparente e roteamento por container aberto
// (li/p), nao pelo topo da pilha. Paridade testada por snapshot em
// tests/emissor.equiv.test.mjs.
//
// Sentinela local (logs/sent_YYYYMMDD.flag) nao existe no remote: a
// idempotencia e o claim do Durable Object (src/state-do.js).

import { UA } from "../collect/noticias.js";

export const RESEND_API = "https://api.resend.com/emails";

// ---------------------------------------------------------------------------
// HTMLParser minimo (equivalente ao HTMLParser do Python com
// convert_charrefs=True, limitado ao vocabulario do briefing: h1/h2/p/li/b/a)
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = parseInt(n, 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      const cp = parseInt(n, 16);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "";
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// pyStrip: str.strip() do Python, que tambem remove \xa0.
export function pyStrip(s) {
  return s.replace(/^[\s\u00a0]+/, "").replace(/[\s\u00a0]+$/, "");
}

function tokenizeHtml(html) {
  // Devolve lista de eventos {type:'start'|'end'|'data', tag?, data?},
  // espelhando o comportamento do HTMLParser (tags lowercased, comentarios
  // pulados, self-closing vira start+end, entidades decodificadas no data).
  const events = [];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g;
  for (const tok of html.matchAll(re)) {
    const t = tok[0];
    if (t.startsWith("<!--") || t.startsWith("<!")) continue;
    if (t.startsWith("<")) {
      let body = t.slice(1);
      let closing = false;
      let selfClose = false;
      if (body.startsWith("/")) {
        closing = true;
        body = body.slice(1);
      }
      if (body.endsWith("/>")) {
        selfClose = true;
        body = body.slice(0, -2);
      } else if (body.endsWith(">")) {
        body = body.slice(0, -1);
      }
      const name = (body.trim().split(/\s/, 1)[0] || "").toLowerCase();
      if (!name) continue;
      if (closing) {
        events.push({ type: "end", tag: name });
      } else {
        events.push({ type: "start", tag: name });
        if (selfClose) events.push({ type: "end", tag: name });
      }
    } else {
      events.push({ type: "data", data: decodeEntities(t) });
    }
  }
  return events;
}

class BriefingContent {
  constructor() {
    this.sections = []; // [(titulo, [(tipo, dados)])]
    this._current = null;
    this._stack = [];
    this._pSegments = null;
    this._liSegments = null;
    this._bareSegments = null;
  }

  _flushBare() {
    if (this._bareSegments && this._current !== null) {
      this._current[1].push(["p", this._bareSegments]);
    }
    this._bareSegments = null;
  }

  finish() {
    this._flushBare();
  }

  feed(html) {
    for (const ev of tokenizeHtml(html)) {
      if (ev.type === "start") this.handleStarttag(ev.tag);
      else if (ev.type === "end") this.handleEndtag(ev.tag);
      else this.handleData(ev.data);
    }
    this.finish();
  }

  handleStarttag(tag) {
    if (tag === "h1" || tag === "h2") {
      this._flushBare();
      this._current = ["", []];
      this.sections.push(this._current);
      this._stack.push(tag);
    } else if (tag === "p" && this._current !== null) {
      this._flushBare();
      this._pSegments = [];
      this._stack.push("p");
    } else if (tag === "li" && this._current !== null) {
      this._flushBare();
      this._liSegments = [];
      this._stack.push("li");
    } else if (tag === "b" && this._current !== null) {
      this._stack.push("b");
    }
  }

  handleEndtag(tag) {
    if (this._stack.length && this._stack[this._stack.length - 1] === tag) {
      this._stack.pop();
    }
    if (tag === "p" && this._pSegments !== null) {
      this._current[1].push(["p", this._pSegments]);
      this._pSegments = null;
    } else if (tag === "li" && this._liSegments !== null) {
      this._current[1].push(["li", this._liSegments]);
      this._liSegments = null;
    }
  }

  handleData(data) {
    if (!pyStrip(data)) return;
    if (this._current === null) return;
    const top = this._stack.length ? this._stack[this._stack.length - 1] : null;
    if (top === "h1" || top === "h2") {
      this._current[0] += data;
      return;
    }
    // Roteia pelo container aberto (li/p), nao pelo topo imediato da pilha
    // (bugfix de 17/08: <b> dentro de <li> nao pode desviar o texto).
    if (this._liSegments !== null) {
      this._append(this._liSegments, data);
    } else if (this._pSegments !== null) {
      this._append(this._pSegments, data);
    } else {
      if (this._bareSegments === null) this._bareSegments = [];
      this._append(this._bareSegments, data);
    }
  }

  _append(segments, data) {
    const bold = this._stack.includes("b");
    if (segments.length && segments[segments.length - 1][1] === bold) {
      segments[segments.length - 1][0] += data;
    } else {
      segments.push([data, bold]);
    }
  }
}

// ---------------------------------------------------------------------------
// Remocao de fonte e confianca (so visual; o disco mantem, o validador usa)
// ---------------------------------------------------------------------------

const URLISH_RE = /^(https?:\/\/)?[a-zA-Z0-9./-]+\.[a-z]{2,}(\/|$)/;

export function stripFonteEConfianca(texto) {
  // Porta exata do Python: o \s* inicial do CONFIANCA_RE consome o espaco
  // junto com o parentese; CONFIANCA_SOLTA_RE cobre o formato sem parenteses.
  let out = texto.replace(/(\s*)\([^)]*confian[çc]a[^)]*\)/gi, "");
  out = out.replace(/(\s*)[Cc]onfian[çc]a\s*[:=]\s*\d+[.,]\d+\.?/g, "");
  out = out.replace(/\[([^[\]]+)\]/g, (m, inner) => {
    const s = pyStrip(inner);
    return URLISH_RE.test(s) ? "" : m;
  });
  return out;
}

// escapeHtml: html.escape do Python com quote=True (& < > " ').
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Linhas do e-mail (porta byte a byte dos _*_row do Python)
// ---------------------------------------------------------------------------

function sectionHeaderRow(titulo) {
  const t = escapeHtml(titulo);
  const up = titulo.toUpperCase().includes("SUBIR");
  const down = titulo.toUpperCase().includes("DESCER");
  let marker = "";
  if (up || down) {
    const color = up ? "#1a8a5c" : "#b33a3a";
    marker =
      '<td width="14" valign="middle" style="width:14px;">' +
      '<span style="display:inline-block;width:8px;height:8px;' +
      `background-color:${color};">&nbsp;</span></td>`;
  }
  return (
    '<tr><td style="padding:26px 32px 4px;">' +
    '<table role="presentation" width="100%" cellspacing="0" ' +
    'cellpadding="0" border="0">' +
    `<tr>${marker}` +
    "<td style=\"font-family:Georgia,'Times New Roman',Times,serif;" +
    "font-size:15px;font-weight:bold;color:#0a1428;line-height:22px;" +
    'border-bottom:1px solid #92703a;padding-bottom:8px;">' +
    `${t}</td></tr></table></td></tr>`
  );
}

function renderSegments(segments) {
  const parts = [];
  for (const [texto, bold] of segments) {
    const t = escapeHtml(stripFonteEConfianca(texto));
    if (bold) {
      parts.push(`<strong style="color:#0a1428;">${t}</strong>`);
    } else {
      parts.push(t);
    }
  }
  return parts.join("");
}

function paragraphRow(segments) {
  const inner = renderSegments(segments);
  return (
    '<tr><td style="padding:12px 32px 2px;' +
    "font-family:Georgia,'Times New Roman',Times,serif;" +
    "font-size:14px;color:#1a2030;line-height:24px;" +
    `mso-line-height-rule:exactly;">${inner}</td></tr>`
  );
}

function splitPorNegrito(segments) {
  // Cada segmento em negrito abre um ponto novo (o modelo marca o titulo
  // do ponto com <b>).
  const grupos = [];
  let atual = [];
  for (const seg of segments) {
    if (seg[1] && atual.length) {
      grupos.push(atual);
      atual = [];
    }
    atual.push(seg);
  }
  if (atual.length) grupos.push(atual);
  return grupos;
}

function numberedRow(numero, segments) {
  // O modelo numera os pontos no proprio texto ("1. Titulo"). Tira o numero
  // do primeiro segmento para nao duplicar com o numero do e-mail.
  let segs = segments;
  if (segs.length) {
    const [texto0, bold0] = segs[0];
    const semNumero = texto0.replace(/^\d+\.\s*/, "");
    segs = [[semNumero, bold0]].concat(segs.slice(1));
  }
  const inner = renderSegments(segs);
  return (
    '<tr><td style="padding:8px 32px 2px;' +
    "font-family:Georgia,'Times New Roman',Times,serif;" +
    "font-size:14px;color:#1a2030;line-height:24px;" +
    'mso-line-height-rule:exactly;">' +
    "<span style=\"font-family:'Courier New',Courier,monospace;" +
    `font-size:11px;color:#92703a;">${numero}.</span>&nbsp;${inner}` +
    "</td></tr>"
  );
}

function bulletRow(segments) {
  const inner = renderSegments(segments);
  return (
    '<tr><td style="padding:6px 32px;' +
    "font-family:Georgia,'Times New Roman',Times,serif;" +
    "font-size:14px;color:#1a2030;line-height:24px;" +
    'mso-line-height-rule:exactly;">' +
    `<span style="color:#92703a;">&bull;</span>&nbsp;${inner}</td></tr>`
  );
}

// buildStyledEmail: porta byte a byte de build_styled_email (template hero,
// corpo e rodape da paleta do relatorio diario).
export function buildStyledEmail(htmlContent, dataFmt) {
  const parser = new BriefingContent();
  parser.feed(htmlContent);

  const secoesRemovidas = ["RADAR QUANT", "MORNING CALL"];

  const bodyRows = [];
  for (const [titulo, itens] of parser.sections) {
    if (secoesRemovidas.some((s) => titulo.toUpperCase().includes(s))) continue;
    if (!itens.length) continue; // secao so de titulo: o hero ja traz o titulo
    bodyRows.push(sectionHeaderRow(titulo));
    const numerado = titulo.toUpperCase().includes("IMPORTA");
    let n = 0;
    for (const [tipo, dados] of itens) {
      if (tipo === "p" && numerado) {
        for (const grupo of splitPorNegrito(dados)) {
          n += 1;
          bodyRows.push(numberedRow(n, grupo));
        }
      } else if (tipo === "p") {
        bodyRows.push(paragraphRow(dados));
      } else if (tipo === "li" && numerado) {
        n += 1;
        bodyRows.push(numberedRow(n, dados));
      } else if (tipo === "li") {
        bodyRows.push(bulletRow(dados));
      }
    }
  }
  const corpo = bodyRows.join("\n");
  const dataEscaped = escapeHtml(dataFmt);

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Briefing Matinal, ${dataEscaped}</title>
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
              ${dataEscaped}
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
${corpo}

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
</html>`;
}

// buildPlainText: versao texto puro, porta de build_plain_text.
export function buildPlainText(htmlContent) {
  let texto = htmlContent.replace(/<[^>]+>/g, " ");
  texto = texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
  texto = texto.replace(/[ \t]+/g, " ");
  texto = texto.replace(/\n\s*\n+/g, "\n\n");
  return texto.trim();
}

export const MESES_DATA_FMT = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function dataFormatada(dataTag) {
  // "DD de Mes de YYYY" — porta do trecho do Python; fallback para o tag cru.
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(dataTag);
  if (!m) return dataTag;
  const dia = parseInt(m[3], 10);
  const mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12) return dataTag;
  return `${String(dia).padStart(2, "0")} de ${MESES_DATA_FMT[mes - 1]} de ${m[1]}`;
}

export function parseExtraRecipients(raw) {
  return (raw || "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

// sendResend: porta de _send_resend. Exige campo id na resposta (T02).
export async function sendResend({ apiKey, fromEmail, toEmail, subject, html, text, bccList, fetchImpl }) {
  const payload = {
    from: fromEmail,
    to: [toEmail],
    subject,
    html,
    text,
  };
  if (bccList && bccList.length) payload.bcc = bccList;
  const body = JSON.stringify(payload);

  let resp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      resp = await (fetchImpl || fetch)(RESEND_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": UA,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (exc) {
    throw new Error(`Resend rede/timeout: ${exc}`, { cause: exc });
  }

  if (!resp.ok) {
    let corpo = "(corpo indisponivel)";
    try {
      corpo = (await resp.text()).slice(0, 500);
    } catch {
      /* mantem o placeholder */
    }
    throw new Error(`Resend HTTP ${resp.status}: ${corpo}`);
  }

  let result;
  try {
    result = await resp.json();
  } catch {
    result = null;
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Resend resposta nao-JSON ou shape inesperado");
  }
  const emailId = result.id;
  if (!emailId) {
    throw new Error("Resend resposta sem id de envio");
  }
  return emailId;
}
